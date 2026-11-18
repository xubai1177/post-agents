import { contextBridge, ipcRenderer } from 'electron'
import type { SettingsApi } from '../shared/settings'
import type { DraftsApi } from '../shared/drafts'
import type { GenerationProgress } from '../shared/research'
import type { TopicsApi, TopicEvent } from '../shared/topics'
import type { ImagesApi } from '../shared/images'

const settings: SettingsApi = {
  load: (legacy) => ipcRenderer.invoke('settings:load', legacy),
  save: (value) => ipcRenderer.invoke('settings:save', value),
  chooseDirectory: () => ipcRenderer.invoke('settings:choose-directory')
}
contextBridge.exposeInMainWorld('settingsApi', settings)

const drafts: DraftsApi = {
  list: () => ipcRenderer.invoke('drafts:list'),
  read: (id, platform) => ipcRenderer.invoke('drafts:read', id, platform),
  save: (id, platform, content, version) => ipcRenderer.invoke('drafts:save', id, platform, content, version),
  generate: (request) => ipcRenderer.invoke('drafts:generate', request),
  research: (id) => ipcRenderer.invoke('drafts:research', id),
  openSource: (id, url) => ipcRenderer.invoke('drafts:open-source', id, url),
  onProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, phase: GenerationProgress) => { if (['research', 'plan', 'write', 'review', 'save'].includes(phase)) callback(phase) }
    ipcRenderer.on('drafts:progress', handler)
    return () => ipcRenderer.removeListener('drafts:progress', handler)
  }
}
contextBridge.exposeInMainWorld('draftsApi', drafts)

const images: ImagesApi = {
  list: (id, platform) => ipcRenderer.invoke('images:list', id, platform),
  generate: (request) => ipcRenderer.invoke('images:generate', request)
}
contextBridge.exposeInMainWorld('imagesApi', images)

const topics: TopicsApi = {
  start: (runId, request) => ipcRenderer.invoke('topics:start', runId, request),
  resume: (runId, mode) => ipcRenderer.invoke('topics:resume', runId, mode),
  openSource: (url) => ipcRenderer.invoke('topics:open-source', url),
  onProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, update: TopicEvent) => callback(update)
    ipcRenderer.on('topics:progress', handler)
    return () => ipcRenderer.removeListener('topics:progress', handler)
  }
}
contextBridge.exposeInMainWorld('topicsApi', topics)
