import type { Platform } from './drafts'
import type { ResearchSource } from './research'
import type { Result } from './settings'

export interface TopicRequest { direction: string; audience: string; platforms: Platform[] }
export interface TopicCandidate { title: string; angle: string; reason: string; platforms: Platform[]; sourceIndexes: number[]; pending: string[] }
export interface TopicBatch { request: TopicRequest; candidates: TopicCandidate[]; sources: ResearchSource[]; skipped: boolean }
export interface TopicEvent { runId: string; phase: 'search' | 'read' | 'generate' | 'organize'; sources?: ResearchSource[] }
export type TopicRunResult = { status: 'research_failed'; error: string } | { status: 'completed'; batch: TopicBatch; warning?: string }
export interface TopicsApi {
  start: (runId: string, request: TopicRequest) => Promise<Result<TopicRunResult>>
  resume: (runId: string, mode: 'retry' | 'skip') => Promise<Result<TopicRunResult>>
  openSource: (url: string) => Promise<Result<void>>
  onProgress: (callback: (event: TopicEvent) => void) => () => void
}
