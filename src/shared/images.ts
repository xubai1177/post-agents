import type { Platform } from './drafts'
import type { ImageStyle } from './image-styles'
import type { Result } from './settings'
export interface DraftImage { name: string; dataUrl: string }
export interface ImageRequest { id: string; platform: Platform; version: string; count?: number; style?: ImageStyle }
export interface ImageGenerationResult { images: DraftImage[]; failures: { index: number; error: string }[] }
export interface ArticleImagesRequest { id: string; platforms: Platform[]; style: ImageStyle; runId: string }
export interface ArticleImagesProgress { runId: string; message: string }
export type ImageProgress = { phase: 'planning' } | { phase: 'generating'; current: number; total: number; completed: number }
export interface ImageJob { progress?: ImageProgress; id: string; platform: Platform; status: 'queued' | 'running' | 'done' | 'failed'; message?: string }
export type ImageDownloadRequest = { id: string; platform: Platform } & (
  { kind: 'single'; name: string } | { kind: 'all' }
)
export interface ImageDownloadResult { saved: number; failed: number }
export interface ImagesApi {
  enqueue: (request: ImageRequest) => Promise<Result<void>>
  jobs: () => Promise<Result<ImageJob[]>>
  onJobsChanged: (callback: () => void) => () => void
  list: (id: string, platform: Platform) => Promise<Result<DraftImage[]>>
  remove: (id: string, platform: Platform, name: string) => Promise<Result<void>>
  download: (request: ImageDownloadRequest) => Promise<Result<ImageDownloadResult | null>>
  generate: (request: ImageRequest) => Promise<Result<ImageGenerationResult>>
  generateForArticle: (request: ArticleImagesRequest) => Promise<Result<string[]>>
  onArticleProgress: (callback: (progress: ArticleImagesProgress) => void) => () => void
}
