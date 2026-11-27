import { contextBridge, ipcRenderer } from 'electron'
import type { CanvasWindowApi } from '../shared/whiteboard'

window.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.windowPlatform = process.platform })
const canvas: CanvasWindowApi = {
  close: () => ipcRenderer.invoke('whiteboard:canvas-close'),
  appearance: () => ipcRenderer.invoke('whiteboard:canvas-appearance'),
  listLocalBackgrounds: () => ipcRenderer.invoke('whiteboard:canvas-local-backgrounds'),
  readLocalBackground: (group, filename) => ipcRenderer.invoke('whiteboard:canvas-local-background', group, filename),
  importImage: () => ipcRenderer.invoke('whiteboard:canvas-import'),
  generateImage: (description, purpose, ratio) => ipcRenderer.invoke('whiteboard:canvas-generate', description, purpose, ratio),
  saveVideo: bytes => ipcRenderer.invoke('whiteboard:canvas-save-video', bytes)
}
contextBridge.exposeInMainWorld('canvasApi', canvas)
