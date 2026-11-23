import { randomUUID } from 'node:crypto'
import type { Draft, StartArticleRequest, ArticleRun } from '../../../shared/drafts'
import type { TopicWorkspace, TopicTask } from '../../../shared/topics'
import type { Platform } from '../../../shared/drafts'
import type { ImageStyle } from '../../../shared/image-styles'

type Options = { batchId: string; indexes: number[]; platforms: Platform[]; imageStyle: ImageStyle; generateImages: boolean }
type Dependencies = {
  update: (root: string, change: (data: TopicWorkspace) => TopicWorkspace) => Promise<TopicWorkspace>
  start: (root: string, options: StartArticleRequest) => Promise<Draft>
  assertTitle: (root: string, title: string) => Promise<void>
}

export async function startBatchArticles(root: string, options: Options, deps: Dependencies): Promise<void> {
  const planned: { task: TopicTask; angle: string; audience: string }[] = []
  await deps.update(root, data => {
    const record = data.batches.find(item => item.id === options.batchId)
    if (!record || options.indexes.some(index => !record.batch.candidates[index])) throw new Error('选题操作：找不到所选选题。')
    for (const index of options.indexes) {
      if (data.tasks.some(task => task.batchId === record.id && task.index === index && (task.status === 'running' || task.status === 'done'))) continue
      const candidate = record.batch.candidates[index]
      planned.push({ task: { id: randomUUID(), batchId: record.id, index, title: candidate.title, status: 'running' }, angle: candidate.angle, audience: record.batch.request.audience })
    }
    if (!planned.length) throw new Error('选题操作：所选选题已创建任务。')
    return { ...data, tasks: [...planned.map(item => item.task), ...data.tasks] }
  })
  for (const item of planned) {
    try {
      if (!item.task.title.trim() || item.task.title.length > 100 || item.angle.length > 2000 || item.audience.length > 500) throw new Error('文章操作：选题内容超过文章生成长度限制。')
      await deps.assertTitle(root, item.task.title)
      const draft = await deps.start(root, { request: { title: item.task.title, angle: item.angle, audience: item.audience, platforms: options.platforms, research: 'online' }, imageStyle: options.imageStyle, generateImages: options.generateImages, folderId: null })
      await deps.update(root, data => ({ ...data, tasks: data.tasks.map(task => task.id === item.task.id ? { ...task, draftId: draft.id } : task) }))
    } catch (error) {
      const message = error instanceof Error && (error.message.startsWith('文章操作：') || error.message.includes('同名')) ? error.message.replace('文章操作：', '') : '创建文章任务失败，请检查工作空间。'
      await deps.update(root, data => ({ ...data, tasks: data.tasks.map(task => task.id === item.task.id ? { ...task, status: 'failed', message } : task) }))
    }
  }
}

export function taskWithArticleRun(task: TopicTask, runs: ArticleRun[]): TopicTask {
  if (!task.draftId) return task
  const run = runs.find(item => item.id === task.draftId)
  if (!run) return task.status === 'running' ? { ...task, status: 'interrupted', message: '文章任务不存在，请检查文章。' } : task
  const status = run.status === 'done' ? 'done' : run.status === 'interrupted' ? 'interrupted' : run.status === 'failed' || run.status === 'waiting' ? 'failed' : 'running'
  const phase = run.status === 'queued' ? '排队中' : run.status === 'running' ? (run.phase === 'images' ? run.imageProgress || '生成配图' : ({ research: '检索资料', plan: '规划内容', write: '撰写文案', review: '检查内容', save: '保存文章' } as const)[run.phase ?? 'research']) : undefined
  return { ...task, status, message: run.message, phase, waiting: run.status === 'waiting' }
}
