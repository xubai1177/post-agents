import type { Platform } from './drafts'
import type { ResearchSource } from './research'
import type { Result } from './settings'

export const defaultTopicCount = 5
export const minTopicCount = 1
export const maxTopicCount = 20
export function isTopicCount(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= minTopicCount && value <= maxTopicCount }
// count is optional so records saved before this setting remain readable.
export interface TopicRequest { direction: string; audience: string; platforms: Platform[]; count?: number }
export interface TopicCandidate { title: string; angle: string; reason: string; platforms: Platform[]; sourceIndexes: number[]; pending: string[] }
export interface TopicBatch { request: TopicRequest; candidates: TopicCandidate[]; sources: ResearchSource[]; skipped: boolean }
export interface TopicEvent { runId: string; phase: 'search' | 'read' | 'generate' | 'organize'; sources?: ResearchSource[] }
export type TopicRunResult = { status: 'research_failed'; error: string } | { status: 'completed'; batch: TopicBatch; warning?: string }
export interface TopicRecord { id: string; createdAt: string; batch: TopicBatch }
export interface TopicTask { id: string; batchId: string; index: number; title: string; status: 'running' | 'done' | 'failed' | 'interrupted'; draftId?: string; message?: string }
export interface TopicGenerationTask { id: string; request: TopicRequest; createdAt: string; status: 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'interrupted'; phase: TopicEvent['phase']; message?: string; recordId?: string }
export interface TopicWorkspace { version: 1; batches: TopicRecord[]; tasks: TopicTask[]; topicRuns?: TopicGenerationTask[] }
export interface TopicsApi {
  readRecords: () => Promise<Result<TopicWorkspace>>
  saveRecords: (data: TopicWorkspace) => Promise<Result<TopicWorkspace>>
  start: (request: TopicRequest) => Promise<Result<void>>
  retry: (id: string, mode: 'retry' | 'skip') => Promise<Result<void>>
  onChanged: (callback: () => void) => () => void
  openSource: (url: string) => Promise<Result<void>>
}

/** Restore only terminal outcomes after an application restart; in-flight work is not resumed. */
export function markInterruptedTopicTasks(data: TopicWorkspace): TopicWorkspace {
  return {
    ...data,
    tasks: data.tasks.map(task => task.status === 'running' ? { ...task, status: 'interrupted', message: '应用退出前任务未完成，请检查文章后重新发起。' } : task),
    topicRuns: (data.topicRuns ?? []).map(task => task.status === 'queued' || task.status === 'running' || task.status === 'waiting' ? { ...task, status: 'interrupted', message: '应用退出前选题任务未完成，请重新生成。' } : task)
  }
}
