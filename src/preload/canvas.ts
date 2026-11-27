import { contextBridge, ipcRenderer } from 'electron'
import type { CanvasWindowApi } from '../shared/whiteboard'

window.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.windowPlatform = process.platform })
const canvas: CanvasWindowApi = {
  listVoiceConfigs: () => ipcRenderer.invoke('whiteboard:canvas-voice-configs'),
  previewCloudVoice: (configId, speaker, text, speed) => ipcRenderer.invoke('whiteboard:canvas-voice-sample', configId, speaker, text, speed),
  voiceStatuses: (id, data) => ipcRenderer.invoke('whiteboard:canvas-voice-status', id, data),
  generateVoice: (id, revision, panelId) => ipcRenderer.invoke('whiteboard:canvas-voice-generate', id, revision, panelId),
  previewVoice: (id, data, panelId) => ipcRenderer.invoke('whiteboard:canvas-voice-audio', id, data, panelId),
  listProjects: () => ipcRenderer.invoke('whiteboard:canvas-project-list'),
  loadProject: id => ipcRenderer.invoke('whiteboard:canvas-project-load', id),
  saveProject: (id, revision, data) => ipcRenderer.invoke('whiteboard:canvas-project-save', id, revision, data),
  close: () => ipcRenderer.invoke('whiteboard:canvas-close'),
  appearance: () => ipcRenderer.invoke('whiteboard:canvas-appearance'),
  listLocalBackgrounds: () => ipcRenderer.invoke('whiteboard:canvas-local-backgrounds'),
  readLocalBackground: (group, filename) => ipcRenderer.invoke('whiteboard:canvas-local-background', group, filename),
  importImage: () => ipcRenderer.invoke('whiteboard:canvas-import'),
  generateImage: (description, purpose, ratio) => ipcRenderer.invoke('whiteboard:canvas-generate', description, purpose, ratio),
  saveVideo: bytes => ipcRenderer.invoke('whiteboard:canvas-save-video', bytes)
}
contextBridge.exposeInMainWorld('canvasApi', canvas)
