import type { ImageStyle } from './image-styles'
import type { Draft } from './drafts'
import type { AppSettings, Result } from './settings'

export interface WorkspaceFolder { id: string; name: string; parentId: string | null }
export type WorkspaceNodeId = `folder:${string}` | `article:${string}`
export interface WorkspaceIndex { version: 1; folders: WorkspaceFolder[]; assignments: Record<string, string>; titles: Record<string, string>; imageStyles: Record<string, ImageStyle>; order?: WorkspaceNodeId[]; defaultFolderId?: string; generationFolderId?: string; topicFolders?: Record<string, string> }
export type WorkspaceNode =
  | { id: `folder:${string}`; kind: 'folder'; item: WorkspaceFolder }
  | { id: `article:${string}`; kind: 'article'; item: Draft }

export function isWorkspaceNodeId(value: unknown): value is WorkspaceNodeId {
  return typeof value === 'string' && /^(?:folder:[a-zA-Z0-9-]{1,80}|article:[^\\/\0]{1,255})$/.test(value)
}

export function workspaceChildren(index: WorkspaceIndex, drafts: Draft[], parentId: string | null): WorkspaceNode[] {
  const children = new Map<WorkspaceNodeId, WorkspaceNode>()
  for (const folder of index.folders) {
    if (folder.parentId === parentId) children.set(`folder:${folder.id}`, { id: `folder:${folder.id}`, kind: 'folder', item: folder })
  }
  for (const draft of drafts) {
    const parent = Object.hasOwn(index.assignments, draft.id) ? index.assignments[draft.id] : null
    if (parent === parentId) children.set(`article:${draft.id}`, { id: `article:${draft.id}`, kind: 'article', item: draft })
  }
  const ordered: WorkspaceNode[] = []
  for (const id of index.order ?? []) {
    const child = children.get(id)
    if (child) { ordered.push(child); children.delete(id) }
  }
  return [...ordered, ...children.values()]
}

export type WorkspaceChange =
  | { type: 'setGenerationFolder'; id: string }
  | { type: 'ensureTopicFolder'; batchId: string; name: string; parentId: string }
  | { type: 'create'; name: string; parentId: string | null }
  | { type: 'rename'; id: string; name: string }
  | { type: 'delete'; id: string }
  | { type: 'moveNodes'; nodes: WorkspaceNodeId[]; folderId: string | null }
  | { type: 'moveDraft'; draftId: string; folderId: string | null }
  | { type: 'reorder'; parentId: string | null; node: WorkspaceNodeId; target: WorkspaceNodeId; position: 'before' | 'after' }
  | { type: 'setImageStyle'; draftId: string; style: ImageStyle }
  | { type: 'renameArticle'; draftId: string; title: string; expectedTitle: string }
export interface DeleteNodesPlan { nodes: WorkspaceNodeId[]; folderIds: string[]; articleIds: string[] }
export interface DeleteNodesResult { index: WorkspaceIndex; deletedArticleIds: string[]; deletedFolderIds: string[]; errors: string[] }
export interface DeleteArticleResult { index: WorkspaceIndex; warning?: string }
export type WorkspaceMenuAction = 'open' | 'create' | 'import' | 'export' | 'settings'
export interface BackupExportProgress { phase: 'preparing' | 'writing' | 'finishing'; files: number; bytes: number }
export interface WorkspaceApi {
  onExportProgress: (callback: (progress: BackupExportProgress) => void) => () => void
  onMenuAction: (callback: (action: WorkspaceMenuAction) => void) => () => void
  listWorkspaces: () => Promise<Result<{ current: string; recent: string[] }>>
  switchWorkspace: (directory: string) => Promise<Result<AppSettings>>
  read: () => Promise<Result<WorkspaceIndex & { directory: string }>>
  change: (change: WorkspaceChange) => Promise<Result<WorkspaceIndex>>
  previewDeleteNodes: (nodes: WorkspaceNodeId[]) => Promise<Result<DeleteNodesPlan>>
  deleteNodes: (plan: DeleteNodesPlan) => Promise<Result<DeleteNodesResult>>
  deleteArticle: (id: string) => Promise<Result<DeleteArticleResult>>
  open: () => Promise<Result<AppSettings | null>>
  create: (name: string) => Promise<Result<AppSettings | null>>
  exportBackup: (password: string) => Promise<Result<boolean>>
  importBackup: (password: string, name: string) => Promise<Result<AppSettings | null>>
}
