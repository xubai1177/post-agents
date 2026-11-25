import { contextBridge, ipcRenderer } from 'electron'
import type { SettingsApi } from '../shared/settings'
import type { DraftsApi } from '../shared/drafts'
import type { GenerationProgress } from '../shared/research'
import type { TopicsApi } from '../shared/topics'
import type { ImagesApi, ArticleImagesProgress } from '../shared/images'
import type { UpdatesApi, UpdateState } from '../shared/updates'
import type { WorkspaceApi } from '../shared/workspace'

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.windowPlatform = process.platform
})

const settings: SettingsApi = {
  load: (legacy) => ipcRenderer.invoke('settings:load', legacy),
  savePlatformConfig: (config) => ipcRenderer.invoke('settings:save-platform-config', config),
  openPlatform: (name) => ipcRenderer.invoke('settings:open-platform', name),
  save: (value) => ipcRenderer.invoke('settings:save', value),
  chooseDirectory: () => ipcRenderer.invoke('settings:choose-directory'),
  listModels: (request) => ipcRenderer.invoke('settings:list-models', request)
}
contextBridge.exposeInMainWorld('settingsApi', settings)

const drafts: DraftsApi = {
  list: () => ipcRenderer.invoke('drafts:list'),
  read: (id, platform) => ipcRenderer.invoke('drafts:read', id, platform),
  readTitle: (id, platform) => ipcRenderer.invoke('drafts:read-title', id, platform),
  saveTitle: (id, platform, title, expected) => ipcRenderer.invoke('drafts:save-title', id, platform, title, expected),
  save: (id, platform, content, version) => ipcRenderer.invoke('drafts:save', id, platform, content, version),
  generate: (request) => ipcRenderer.invoke('drafts:generate', request),
  createBlank: (request) => ipcRenderer.invoke('drafts:create-blank', request),
  optimize: (request) => ipcRenderer.invoke('drafts:optimize', request),
  regenerate: (request) => ipcRenderer.invoke('drafts:regenerate', request),
  testPlatformPrompt: (request) => ipcRenderer.invoke('drafts:test-platform-prompt', request),
  generateTitles: (request) => ipcRenderer.invoke('drafts:generate-titles', request),
  research: (id, platform) => ipcRenderer.invoke('drafts:research', id, platform),
  openSource: (id, url, platform) => ipcRenderer.invoke('drafts:open-source', id, url, platform),
  onProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, phase: GenerationProgress) => { if (['research', 'plan', 'write', 'review', 'save'].includes(phase)) callback(phase) }
    ipcRenderer.on('drafts:progress', handler)
    return () => ipcRenderer.removeListener('drafts:progress', handler)
  },
  startArticle: (request) => ipcRenderer.invoke('drafts:start-article', request),
  articleRuns: () => ipcRenderer.invoke('drafts:article-runs'),
  retryArticle: (id, skipResearch) => ipcRenderer.invoke('drafts:retry-article', id, skipResearch),
  onArticlesChanged: (callback) => { const handler = () => callback(); ipcRenderer.on('drafts:articles-changed', handler); return () => ipcRenderer.removeListener('drafts:articles-changed', handler) }
}
contextBridge.exposeInMainWorld('draftsApi', drafts)

const images: ImagesApi = {
  enqueue: (request) => ipcRenderer.invoke('images:enqueue', request),
  jobs: () => ipcRenderer.invoke('images:jobs'),
  onJobsChanged: (callback) => { const handler = () => callback(); ipcRenderer.on('images:jobs-changed', handler); return () => ipcRenderer.removeListener('images:jobs-changed', handler) },
  list: (id, platform) => ipcRenderer.invoke('images:list', id, platform),
  remove: (id, platform, name) => ipcRenderer.invoke('images:remove', id, platform, name),
  download: (request) => ipcRenderer.invoke('images:download', request),
  generate: (request) => ipcRenderer.invoke('images:generate', request),
  generateForArticle: (request) => ipcRenderer.invoke('images:generate-for-article', request),
  onArticleProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ArticleImagesProgress) => callback(progress)
    ipcRenderer.on('images:article-progress', handler)
    return () => ipcRenderer.removeListener('images:article-progress', handler)
  }
}
contextBridge.exposeInMainWorld('imagesApi', images)

const topics: TopicsApi = {
  readRecords: () => ipcRenderer.invoke('topics:read-records'),
  startBatch: (request) => ipcRenderer.invoke('topics:start-batch', request),
  saveRecords: (data) => ipcRenderer.invoke('topics:save-records', data),
  start: (request) => ipcRenderer.invoke('topics:start', request),
  retry: (id, mode) => ipcRenderer.invoke('topics:retry', id, mode),
  openSource: (url) => ipcRenderer.invoke('topics:open-source', url),
  onChanged: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('topics:changed', handler)
    return () => ipcRenderer.removeListener('topics:changed', handler)
  }
}
contextBridge.exposeInMainWorld('topicsApi', topics)

const workspace: WorkspaceApi = {
  onExportProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: import('../shared/workspace').BackupExportProgress) => callback(progress)
    ipcRenderer.on('workspace:export-progress', listener)
    return () => ipcRenderer.removeListener('workspace:export-progress', listener)
  },
  onMenuAction: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, action: unknown) => { if (action === 'open' || action === 'create' || action === 'import' || action === 'export' || action === 'settings') callback(action) }
    ipcRenderer.on('workspace:menu-action', listener)
    return () => ipcRenderer.removeListener('workspace:menu-action', listener)
  },
  listWorkspaces: () => ipcRenderer.invoke('workspace:list'),
  switchWorkspace: (directory) => ipcRenderer.invoke('workspace:switch', directory),
  read: () => ipcRenderer.invoke('workspace:read'),
  change: (change) => ipcRenderer.invoke('workspace:change', change),
  deleteArticle: (id) => ipcRenderer.invoke('workspace:delete-article', id),
  open: () => ipcRenderer.invoke('workspace:open'),
  create: (name) => ipcRenderer.invoke('workspace:create', name),
  exportBackup: (password) => ipcRenderer.invoke('workspace:export', password),
  importBackup: (password, name) => ipcRenderer.invoke('workspace:import', password, name)
}
contextBridge.exposeInMainWorld('workspaceApi', workspace)

const updates: UpdatesApi = {
  state: () => ipcRenderer.invoke('updates:state'),
  check: () => ipcRenderer.invoke('updates:check'),
  download: () => ipcRenderer.invoke('updates:download'),
  install: () => ipcRenderer.invoke('updates:install'),
  openRelease: () => ipcRenderer.invoke('updates:open-release'),
  onChanged: callback => {
    const handler = (_event: Electron.IpcRendererEvent, value: UpdateState) => callback(value)
    ipcRenderer.on('updates:changed', handler)
    return () => ipcRenderer.removeListener('updates:changed', handler)
  }
}
contextBridge.exposeInMainWorld('updatesApi', updates)
