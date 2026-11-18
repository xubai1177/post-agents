import type { Result } from './settings'
import type { GenerationProgress, ResearchRecord } from './research'
export const platforms = ['小红书', '公众号', '抖音图文'] as const
export type Platform = typeof platforms[number]
export interface Draft { id: string; title: string; platforms: Platform[] }
export interface Document { content: string; version: string }
export interface CreateRequest { title: string; audience: string; angle?: string; platforms: Platform[]; research: 'online' | 'skip' }
export interface CreateResult { draft: Draft | null; failures: { platform: Platform; error: string }[]; warnings?: string[] }
export interface DraftsApi {
  list: () => Promise<Result<Draft[]>>
  read: (id: string, platform: Platform) => Promise<Result<Document>>
  save: (id: string, platform: Platform, content: string, version: string) => Promise<Result<Document>>
  generate: (request: CreateRequest) => Promise<Result<CreateResult>>
  research: (id: string) => Promise<Result<ResearchRecord | null>>
  openSource: (id: string, url: string) => Promise<Result<void>>
  onProgress: (callback: (phase: GenerationProgress) => void) => () => void
}
