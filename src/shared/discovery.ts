import type { Result } from './settings'
import type { Draft } from './drafts'
export interface DiscoveryItem { id: string; title: string; author: string; likes: string; hasCover: boolean }
export interface DiscoveryDetail { id: string; title: string; content: string; author: string; imageCount: number }
export type DiscoveryAccount = { state: 'logged_in'; nickname: string } | { state: 'logged_out' } | { state: 'unknown' }
export interface DiscoveryApi {
  account: () => Promise<Result<DiscoveryAccount>>
  image: (id: string, index: number) => Promise<Result<string | null>>
  login: () => Promise<Result<void>>
  logout: () => Promise<Result<void>>
  search: (query: string) => Promise<Result<DiscoveryItem[]>>
  detail: (id: string) => Promise<Result<DiscoveryDetail>>
  exportOriginal: (id: string) => Promise<Result<{ folder: string; savedImages: number; failedImages: number } | null>>
  rewrite: (id: string) => Promise<Result<string>>
  rewriteImage: (id: string, index: number) => Promise<Result<{ token: string; dataUrl: string }>>
  downloadRewrittenImage: (id: string, token: string) => Promise<Result<string | null>>
  generateImage: (input: { id: string; index: number; title: string; content: string }) => Promise<Result<{ token: string; dataUrl: string }>>
  save: (input: { id: string; title: string; content: string; imageToken?: string }) => Promise<Result<{ draft: Draft; warning?: string }>>
  openOriginal: (id: string) => Promise<Result<void>>
}
