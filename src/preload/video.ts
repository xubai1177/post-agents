import { contextBridge, ipcRenderer } from 'electron'
import type { RenderProgress, VideoWindowApi, WhiteboardApi } from '../shared/whiteboard'
import type { DraftsApi } from '../shared/drafts'

window.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.windowPlatform = process.platform })
const video: VideoWindowApi = {
  appearance: () => ipcRenderer.invoke('whiteboard:video-appearance'),
  setState: (busy, dirty) => ipcRenderer.send('whiteboard:video-state', busy, dirty)
}
const whiteboard: Omit<WhiteboardApi, 'videoOpen' | 'canvasOpen'> = {
  listVoiceConfigs: () => ipcRenderer.invoke('whiteboard:voice-config-list'),
  saveVoiceConfig: input => ipcRenderer.invoke('whiteboard:voice-config-save', input),
  deleteVoiceConfig: id => ipcRenderer.invoke('whiteboard:voice-config-delete', id),
  previewVoice: (configId, speaker, text, speed) => ipcRenderer.invoke('whiteboard:voice-preview', configId, speaker, text, speed),
  list: () => ipcRenderer.invoke('whiteboard:list'), create: topic => ipcRenderer.invoke('whiteboard:create', topic),
  plan: id => ipcRenderer.invoke('whiteboard:plan', id), savePlan: (id, plan) => ipcRenderer.invoke('whiteboard:save-plan', id, plan),
  generateMissingStickers: id => ipcRenderer.invoke('whiteboard:generate-missing-stickers', id),
  generateSticker: (id, scene, beat) => ipcRenderer.invoke('whiteboard:generate-sticker', id, scene, beat),
  sticker: (id, scene, beat) => ipcRenderer.invoke('whiteboard:sticker', id, scene, beat),
  replaceSticker: (id, scene, beat) => ipcRenderer.invoke('whiteboard:replace-sticker', id, scene, beat),
  previewScene: (id, scene, plan) => ipcRenderer.invoke('whiteboard:preview-scene', id, scene, plan),
  render: (id, options) => ipcRenderer.invoke('whiteboard:render', id, options), cancel: id => ipcRenderer.invoke('whiteboard:cancel', id),
  preview: (id, videoId) => ipcRenderer.invoke('whiteboard:preview', id, videoId), deleteVideo: (id, videoId) => ipcRenderer.invoke('whiteboard:video-delete', id, videoId), revealVideo: (id, videoId) => ipcRenderer.invoke('whiteboard:video-reveal', id, videoId), reveal: id => ipcRenderer.invoke('whiteboard:reveal', id),
  onRenderPhase: callback => { const handler = (_event: Electron.IpcRendererEvent, progress: RenderProgress) => { if (progress && (progress.phase === 'voice' || progress.phase === 'render' || progress.phase === 'export')) callback(progress) }; ipcRenderer.on('whiteboard:render-phase', handler); return () => ipcRenderer.removeListener('whiteboard:render-phase', handler) }
}
const drafts: Pick<DraftsApi, 'list' | 'read'> = { list: () => ipcRenderer.invoke('whiteboard:articles'), read: (id, platform) => ipcRenderer.invoke('whiteboard:article-read', id, platform) }
contextBridge.exposeInMainWorld('videoWindowApi', video)
contextBridge.exposeInMainWorld('whiteboardApi', whiteboard)
contextBridge.exposeInMainWorld('draftsApi', drafts)
