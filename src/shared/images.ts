import type { Platform } from './drafts'
import type { Result } from './settings'
export interface DraftImage { name: string; dataUrl: string }
export interface ImageRequest { id: string; platform: Platform; version: string; count: number }
export interface ImageGenerationResult { images: DraftImage[]; failures: { index: number; error: string }[] }
export interface ImagesApi {
  list: (id: string, platform: Platform) => Promise<Result<DraftImage[]>>
  generate: (request: ImageRequest) => Promise<Result<ImageGenerationResult>>
}
