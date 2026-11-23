import type { ImageStyle } from './image-styles'
import type { AppSettings, Result } from './settings'

export interface WorkspaceFolder { id: string; name: string; parentId: string | null }
export interface WorkspaceIndex { version: 1; folders: WorkspaceFolder[]; assignments: Record<string, string>; titles: Record<string, string>; imageStyles: Record<string, ImageStyle> }
export type WorkspaceChange =
  | { type: 'create'; name: string; parentId: string | null }
  | { type: 'rename'; id: string; name: string }
  | { type: 'delete'; id: string }
  | { type: 'moveDraft'; draftId: string; folderId: string | null }
  | { type: 'setImageStyle'; draftId: string; style: ImageStyle }
  | { type: 'renameArticle'; draftId: string; title: string; expectedTitle: string }
export interface DeleteArticleResult { index: WorkspaceIndex; warning?: string }
export interface WorkspaceApi {
  read: () => Promise<Result<WorkspaceIndex>>
  change: (change: WorkspaceChange) => Promise<Result<WorkspaceIndex>>
  deleteArticle: (id: string) => Promise<Result<DeleteArticleResult>>
  open: () => Promise<Result<AppSettings | null>>
  create: (name: string) => Promise<Result<AppSettings | null>>
  exportBackup: (password: string) => Promise<Result<boolean>>
  importBackup: (password: string, name: string) => Promise<Result<AppSettings | null>>
}
