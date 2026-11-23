import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { platforms, type ArticleRun, type CreateRequest, type CreateResult, type Draft, type Platform, type StartArticleRequest, type PromptSnapshot } from '../../../shared/drafts'
import { isPlatformPrompts } from '../../../shared/platform-prompts'
import { isImageStyle } from '../../../shared/image-styles'
import type { GenerationProgress } from '../../../shared/research'
import { ResearchUnavailableError } from '../../errors'
import { listDrafts, readDraft } from '../drafts/draft-store'
import { generateDrafts } from './generation'

const filename = '.post-agents-generation.json'
type Dependencies = {
  generate: (root: string, request: CreateRequest, progress: (phase: GenerationProgress) => void, existing: { id: string; versions: Partial<Record<Platform, string>> }, snapshot?: PromptSnapshot) => Promise<CreateResult>
  snapshot?: () => Promise<PromptSnapshot>
  images: (root: string, draft: Draft, run: ArticleRun, progress: (message: string) => void) => Promise<string[]>
  changed: (root: string) => void
  completed: (result: CreateResult) => void
}
function validRun(value: unknown, id: string): value is ArticleRun {
  if (!value || typeof value !== 'object') return false
  const r = value as ArticleRun, q = r.request
  return (r.promptSnapshot === undefined || (isPlatformPrompts(r.promptSnapshot.platformPrompts) && isPlatformPrompts(r.promptSnapshot.titlePrompts))) && r.id === id && !!q && typeof q.title === 'string' && q.title.length <= 100 && typeof q.audience === 'string' && q.audience.length <= 500 && (q.angle === undefined || (typeof q.angle === 'string' && q.angle.length <= 2000)) && (q.instruction === undefined || (typeof q.instruction === 'string' && q.instruction.length <= 2000)) && (q.research === 'online' || q.research === 'skip') && Array.isArray(q.platforms) && q.platforms.length > 0 && q.platforms.every(p => platforms.includes(p)) && new Set(q.platforms).size === q.platforms.length && !!r.versions && typeof r.versions === 'object' && q.platforms.every(p => typeof r.versions[p] === 'string' && /^[a-f0-9]{64}$/.test(r.versions[p]!)) && ['queued', 'running', 'waiting', 'failed', 'interrupted', 'done'].includes(r.status) && (r.phase === undefined || ['research', 'plan', 'write', 'review', 'save', 'images'].includes(r.phase)) && (r.message === undefined || (typeof r.message === 'string' && r.message.length <= 10000)) && (r.imageProgress === undefined || (typeof r.imageProgress === 'string' && r.imageProgress.length <= 200)) && isImageStyle(r.imageStyle) && typeof r.generateImages === 'boolean'
}
export class ArticleQueue {
  private pending: { root: string; id: string }[] = []
  private active = new Set<string>()
  private preparing = new Set<string>()
  private transientFailures = new Map<string, string>()
  private initialized = new Map<string, Promise<void>>()
  private updates = new Map<string, Promise<unknown>>()
  constructor(private deps: Dependencies, private limit = 3) {}
  private key(root: string, id: string) { return JSON.stringify([root, id]) }
  private async read(root: string, id: string): Promise<ArticleRun | null> {
    try {
      const value: unknown = JSON.parse(await readFile(join(root, id, filename), 'utf8'))
      if (!validRun(value, id)) throw new Error('文章生成记录无效。')
      return value
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  }
  private write(root: string, run: ArticleRun): Promise<void> {
    const key = this.key(root, run.id)
    const pending = (this.updates.get(key) ?? Promise.resolve()).then(async () => {
      const dir = join(root, run.id), temp = join(dir, `.generation-${randomUUID()}.tmp`)
      try { await writeFile(temp, JSON.stringify(run, null, 2), { flag: 'wx', mode: 0o600 }); await rename(temp, join(dir, filename)) } finally { await rm(temp, { force: true }) }
      this.deps.changed(root)
    })
    const settled = pending.catch(() => undefined); this.updates.set(key, settled)
    void settled.then(() => { if (this.updates.get(key) === settled) this.updates.delete(key) })
    return pending
  }
  async load(root: string): Promise<ArticleRun[]> {
    let initialized = this.initialized.get(root)
    if (!initialized) {
      initialized = (async () => {
        for (const draft of await listDrafts(root)) {
          const run = await this.read(root, draft.id)
          if (run && ['queued', 'running', 'waiting'].includes(run.status)) await this.write(root, { ...run, status: 'interrupted', message: '应用退出前生成未完成，请手动重试。' })
        }
      })()
      this.initialized.set(root, initialized)
      void initialized.catch(() => { if (this.initialized.get(root) === initialized) this.initialized.delete(root) })
    }
    await initialized
    const runs = await Promise.all((await listDrafts(root)).map(draft => this.read(root, draft.id)))
    return runs.filter((run): run is ArticleRun => run !== null).map(run => { const message = this.transientFailures.get(this.key(root, run.id)); return message ? { ...run, status: 'failed' as const, message } : run })
  }
  isActive(root: string, id: string): boolean { const key = this.key(root, id); return this.preparing.has(key) || this.active.has(key) || this.pending.some(job => this.key(job.root, job.id) === key) }
  async start(root: string, options: StartArticleRequest): Promise<Draft> {
    await this.load(root)
    const promptSnapshot = await this.deps.snapshot?.()
    const created = await generateDrafts(root, options.request, async () => '', undefined, undefined, undefined, true)
    if (!created.draft) throw new Error('文章操作：无法创建文章，请检查工作空间。')
    const draft = created.draft, versions: Partial<Record<Platform, string>> = {}, key = this.key(root, draft.id)
    this.preparing.add(key)
    try {
      for (const platform of draft.platforms) versions[platform] = (await readDraft(root, draft.id, platform)).version
      const run: ArticleRun = { id: draft.id, ...(promptSnapshot ? { promptSnapshot } : {}), request: { ...options.request, platforms: draft.platforms }, versions, status: 'queued', imageStyle: options.imageStyle, generateImages: options.generateImages, ...(created.failures.length ? { message: `部分平台创建失败：${created.failures.map(item => item.platform).join('、')}` } : {}) }
      try { await this.write(root, run) } catch { throw new Error('文章操作：文章已创建，但生成任务保存失败，请检查工作空间。') }
      this.pending.push({ root, id: draft.id }); this.pump()
      return draft
    } finally { this.preparing.delete(key) }
  }
  async retry(root: string, id: string, skipResearch: boolean): Promise<void> {
    await this.load(root)
    if (this.isActive(root, id)) throw new Error('文章操作：文章正在生成，请稍候。')
    const key = this.key(root, id); this.preparing.add(key)
    try {
      if (!(await listDrafts(root)).some(draft => draft.id === id)) throw new Error('文章操作：文章不存在。')
      const run = await this.read(root, id)
      if (!run || (!['failed', 'interrupted', 'waiting'].includes(run.status) && !this.transientFailures.has(key))) throw new Error('文章操作：当前任务无法重试。')
      if (skipResearch && run.status !== 'waiting') throw new Error('文章操作：当前任务无法跳过联网。')
      await this.write(root, { ...run, request: { ...run.request, research: skipResearch ? 'skip' : run.request.research }, status: 'queued', message: undefined, phase: undefined, imageProgress: undefined })
      this.transientFailures.delete(key)
      this.pending.push({ root, id }); this.pump()
    } finally { this.preparing.delete(key) }
  }
  private pump(): void {
    while (this.active.size < this.limit && this.pending.length) {
      const job = this.pending.shift()!, key = this.key(job.root, job.id)
      this.active.add(key)
      void this.run(job.root, job.id).catch(() => { this.transientFailures.set(key, '文章任务状态保存失败，请检查工作空间后重试。') }).finally(() => { this.active.delete(key); this.deps.changed(job.root); this.pump() })
    }
  }
  private async run(root: string, id: string): Promise<void> {
    let run = await this.read(root, id)
    if (!run || run.status !== 'queued') return
    run = { ...run, status: 'running' }; await this.write(root, run)
    let progress = Promise.resolve()
    try {
      const result = await this.deps.generate(root, run.request, phase => {
        run = { ...run!, phase }
        const snapshot = run
        progress = progress.then(() => this.write(root, snapshot))
        void progress.catch(() => undefined)
      }, { id, versions: run.versions }, run.promptSnapshot)
      await progress
      if (!result.draft) throw new Error('文章生成失败，请检查模型服务或文章是否已修改。')
      this.deps.completed(result)
      const messages = [...(run.message ? [run.message] : []), ...result.failures.map(item => `${item.platform}：${item.error}`), ...(result.warnings ?? [])]
      if (run.generateImages) {
        run = { ...run, phase: 'images' }; await this.write(root, run)
        try {
          messages.push(...await this.deps.images(root, result.draft, run, message => {
            run = { ...run!, imageProgress: message }
            const snapshot = run
            progress = progress.then(() => this.write(root, snapshot))
            void progress.catch(() => undefined)
          }))
          await progress
        } catch { await progress.catch(() => undefined); messages.push('文章已保存，配图生成失败，请检查图片服务。') }
      }
      const failedPlatforms = result.failures.map(item => item.platform)
      await this.write(root, { ...run, ...(failedPlatforms.length ? { request: { ...run.request, platforms: failedPlatforms } } : {}), status: failedPlatforms.length ? 'failed' : 'done', imageProgress: undefined, message: messages.join('；') || undefined })
    } catch (error) {
      await progress.catch(() => undefined)
      const waiting = error instanceof ResearchUnavailableError
      await this.write(root, { ...run, status: waiting ? 'waiting' : 'failed', message: waiting ? '联网核查失败，请重试或跳过联网继续。' : error instanceof Error && error.message.startsWith('文章生成失败') ? error.message : '文章生成失败，请检查模型服务和工作空间后重试。' })
    }
  }
}
