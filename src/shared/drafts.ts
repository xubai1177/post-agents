import type { Result } from './settings'
import type { GenerationProgress, ResearchRecord } from './research'
import type { ImageStyle } from './image-styles'
import type { PlatformPrompts } from './platform-prompts'
export const platforms = ['小红书', '公众号', '抖音图文'] as const
export type Platform = typeof platforms[number]
export interface Draft { id: string; title: string; platforms: Platform[] }
export interface Document { content: string; version: string }
export interface CreateRequest { title: string; audience: string; angle?: string; instruction?: string; platforms: Platform[]; research: 'online' | 'skip' }
export interface CreateResult { draft: Draft | null; failures: { platform: Platform; error: string }[]; warnings?: string[] }
export interface OptimizeRequest { id: string; platform: Platform; version: string; content: string; instruction: string }
export interface RegenerateRequest { id: string; platform: Platform; version: string; title: string; storedTitle: string | null }
export interface GenerateTitlesRequest { id: string; platform: Platform; version: string; content: string }
export interface PromptSnapshot { platformPrompts: PlatformPrompts; titlePrompts: PlatformPrompts }
export interface ArticleRun { imageProgress?: string; promptSnapshot?: PromptSnapshot; id: string; request: CreateRequest; versions: Partial<Record<Platform, string>>; status: 'queued' | 'running' | 'waiting' | 'failed' | 'interrupted' | 'done'; phase?: GenerationProgress | 'images'; message?: string; imageStyle: ImageStyle; generateImages: boolean }
export interface StartArticleRequest { request: CreateRequest; imageStyle: ImageStyle; generateImages: boolean; folderId: string | null }
export interface DraftsApi {
  list: () => Promise<Result<Draft[]>>
  read: (id: string, platform: Platform) => Promise<Result<Document>>
  readTitle: (id: string, platform: Platform) => Promise<Result<string | null>>
  saveTitle: (id: string, platform: Platform, title: string, expected: string | null) => Promise<Result<string>>
  save: (id: string, platform: Platform, content: string, version: string) => Promise<Result<Document>>
  generate: (request: CreateRequest) => Promise<Result<CreateResult>>
  createBlank: (request: CreateRequest) => Promise<Result<CreateResult>>
  optimize: (request: OptimizeRequest) => Promise<Result<string>>
  regenerate: (request: RegenerateRequest) => Promise<Result<{ document: Document; warnings: string[] }>>
  generateTitles: (request: GenerateTitlesRequest) => Promise<Result<string[]>>
  research: (id: string, platform?: Platform) => Promise<Result<ResearchRecord | null>>
  openSource: (id: string, url: string, platform?: Platform) => Promise<Result<void>>
  onProgress: (callback: (phase: GenerationProgress) => void) => () => void
  startArticle: (request: StartArticleRequest) => Promise<Result<{ draft: Draft; warning?: string }>>
  articleRuns: () => Promise<Result<ArticleRun[]>>
  retryArticle: (id: string, skipResearch: boolean) => Promise<Result<void>>
  onArticlesChanged: (callback: () => void) => () => void
}
