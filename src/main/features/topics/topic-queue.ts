import { randomUUID } from 'node:crypto'
import type { TopicEvent, TopicRecord, TopicRequest, TopicRunResult, TopicWorkspace } from '../../../shared/topics'
import { markInterruptedTopicTasks } from '../../../shared/topics'

type Phase = TopicEvent['phase']
type Dependencies = {
  read: (root: string) => Promise<TopicWorkspace>
  update: (root: string, change: (data: TopicWorkspace) => TopicWorkspace) => Promise<TopicWorkspace>
  generate: (request: TopicRequest, skip: boolean, id: string, progress: (event: TopicEvent) => void) => Promise<TopicRunResult>
  changed: (root: string) => void
  completed?: (count: number, partial: boolean) => void
}
type Job = { root: string; id: string; request: TopicRequest; skip: boolean }
export class TopicQueue {
  private readonly pending: Job[] = []
  private active = 0
  private readonly transientFailures = new Map<string, string>()
  private readonly unsaved = new Map<string, { record: TopicRecord; warning?: string }>()
  private readonly saving = new Set<string>()
  private readonly initialized = new Map<string, Promise<void>>()
  constructor(private readonly deps: Dependencies, private readonly limit = 3) {}
  async load(root: string): Promise<TopicWorkspace> {
    let initial = this.initialized.get(root)
    if (!initial) {
      initial = this.deps.update(root, data => {
        if (!(data.topicRuns ?? []).some(task => task.status === 'queued' || task.status === 'running' || task.status === 'waiting') && !data.tasks.some(task => task.status === 'running' && !task.draftId)) return data
        const restored = markInterruptedTopicTasks(data)
        // Article creation has its own lifecycle and must not be changed here.
        return { ...data, topicRuns: restored.topicRuns, tasks: data.tasks.map(task => task.status === 'running' && !task.draftId ? { ...task, status: 'interrupted', message: '任务已中断，请检查已有文章后重新创建。' } : task) }
      }).then(() => undefined)
      this.initialized.set(root, initial)
      void initial.catch(() => { if (this.initialized.get(root) === initial) this.initialized.delete(root) })
    }
    await initial
    const data = await this.deps.read(root)
    return { ...data, topicRuns: data.topicRuns?.map(task => { const message = this.transientFailures.get(JSON.stringify([root, task.id])); return message ? { ...task, status: 'failed' as const, message } : task }) }
  }
  async enqueue(root: string, request: TopicRequest): Promise<void> {
    await this.load(root)
    const id = randomUUID(), job = { root, id, request, skip: false }
    await this.deps.update(root, data => ({ ...data, topicRuns: [{ id, request, createdAt: new Date().toISOString(), status: 'queued', phase: 'search' }, ...(data.topicRuns ?? [])] }))
    this.pending.push(job); this.deps.changed(root); this.pump()
  }
  async retry(root: string, id: string, mode: 'retry' | 'skip'): Promise<void> {
    await this.load(root)
    const key = JSON.stringify([root, id])
    const pendingResult = this.unsaved.get(key)
    if (pendingResult) {
      if (this.saving.has(key)) throw new Error('选题操作：选题正在保存，请稍候。')
      this.saving.add(key)
      try { await this.saveResult({ root, id, request: pendingResult.record.batch.request, skip: false }, pendingResult.record, pendingResult.warning); this.unsaved.delete(key) }
      finally { this.saving.delete(key) }
      return
    }
    let request: TopicRequest | undefined
    await this.deps.update(root, data => ({ ...data, topicRuns: (data.topicRuns ?? []).map(task => {
      if (task.id !== id) return task
      if ((!['failed', 'interrupted', 'waiting'].includes(task.status) && !(task.status === 'running' && this.transientFailures.has(key))) || (mode === 'skip' && task.status !== 'waiting')) throw new Error('选题操作：当前任务无法重试。')
      request = task.request
      return { ...task, status: 'queued', phase: mode === 'skip' ? 'generate' : 'search', message: undefined }
    }) }))
    if (!request) throw new Error('选题操作：找不到选题记录。')
    this.transientFailures.delete(key)
    this.pending.push({ root, id, request, skip: mode === 'skip' }); this.deps.changed(root); this.pump()
  }
  private pump(): void {
    while (this.active < this.limit && this.pending.length) {
      const job = this.pending.shift()!
      this.active++
      void this.run(job).finally(() => { this.active--; this.pump() })
    }
  }
  private async change(job: Job, change: (item: NonNullable<TopicWorkspace['topicRuns']>[number]) => NonNullable<TopicWorkspace['topicRuns']>[number]): Promise<void> {
    await this.deps.update(job.root, data => ({ ...data, topicRuns: (data.topicRuns ?? []).map(task => task.id === job.id ? change(task) : task) }))
    this.deps.changed(job.root)
  }
  private async saveResult(job: Job, record: TopicRecord, warning?: string): Promise<void> {
    await this.deps.update(job.root, data => ({ ...data, batches: data.batches.some(item => item.id === record.id) ? data.batches : [record, ...data.batches], topicRuns: (data.topicRuns ?? []).map(task => task.id === job.id ? { ...task, status: 'done', phase: 'organize', recordId: record.id, message: warning } : task) }))
    this.transientFailures.delete(JSON.stringify([job.root, job.id]))
    this.deps.changed(job.root)
    this.deps.completed?.(record.batch.candidates.length, Boolean(warning))
  }
  private async run(job: Job): Promise<void> {
    let progress = Promise.resolve()
    let generated: TopicRecord | undefined
    try {
      await this.change(job, task => ({ ...task, status: 'running', phase: job.skip ? 'generate' : 'search', message: undefined }))
      const result = await this.deps.generate(job.request, job.skip, job.id, event => {
        const phase: Phase = event.phase
        progress = progress.then(() => this.change(job, task => ({ ...task, phase })))
        void progress.catch(() => undefined)
      })
      if (result.status === 'completed') {
        generated = { id: randomUUID(), createdAt: new Date().toISOString(), batch: result.batch }
        this.unsaved.set(JSON.stringify([job.root, job.id]), { record: generated, warning: result.warning })
      }
      await progress
      if (result.status === 'research_failed') { await this.change(job, task => ({ ...task, status: 'waiting', message: result.error })); return }
      if (!generated) throw new Error('missing result')
      await this.saveResult(job, generated, result.warning)
      this.unsaved.delete(JSON.stringify([job.root, job.id]))
    } catch {
      try { await this.change(job, task => ({ ...task, status: 'failed', message: generated ? '选题已生成但保存失败，请重试保存。' : '选题生成或保存失败，请检查模型服务和工作空间后重试。' })) }
      catch { this.transientFailures.set(JSON.stringify([job.root, job.id]), generated ? '选题已生成但保存失败，请重试保存；关闭应用前请先保存。' : '任务状态保存失败，请检查工作空间后重试。'); this.deps.changed(job.root) }
    }
  }
}
