import { platforms, type ArticleRun, type Draft } from '../../../shared/drafts'
import type { ImageJob } from '../../../shared/images'
import type { TopicWorkspace } from '../../../shared/topics'

export function platformCounts(drafts: Draft[]) {
  return platforms.map(platform => ({ platform, count: drafts.filter(draft => draft.platforms.includes(platform)).length }))
}
export function taskCounts(runs: ArticleRun[], topics: TopicWorkspace, images: ImageJob[]) {
  const ids = new Set(runs.map(run => run.id))
  const statuses = [...runs.map(run => run.status), ...topics.tasks.filter(task => !task.draftId || !ids.has(task.draftId)).map(task => task.status), ...(topics.topicRuns ?? []).map(run => run.status), ...images.map(job => job.status)]
  return { active: statuses.filter(status => status === 'queued' || status === 'running').length, attention: statuses.filter(status => status === 'waiting' || status === 'failed' || status === 'interrupted').length, done: statuses.filter(status => status === 'done').length }
}
export function recentTopicDays(topics: TopicWorkspace, now = new Date()) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index)
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
    const start = date.getTime()
    return { key: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`, label: `${date.getMonth() + 1}/${date.getDate()}`, count: topics.batches.filter(batch => { const time = Date.parse(batch.createdAt); return Number.isFinite(time) && time >= start && time < end }).length }
  })
}
