import { app, BrowserWindow, dialog, type WebContents } from 'electron'
import { join } from 'node:path'

let canvasWindow: BrowserWindow | null = null
let loading: Promise<void> | null = null

/** Only one editor can be open, so repeated opens keep its unsaved canvas intact. */
export async function openCanvasWindow(): Promise<void> {
  if (canvasWindow && !canvasWindow.isDestroyed()) {
    if (canvasWindow.isMinimized()) canvasWindow.restore()
    if (loading) await loading
    if (canvasWindow && !canvasWindow.isDestroyed()) { canvasWindow.show(); canvasWindow.focus() }
    return
  }
  const window = new BrowserWindow({
    width: 1380, height: 860, minWidth: 800, minHeight: 600, show: false,
    title: '白板画布 · 灵稿 AI', backgroundColor: '#f5f6f9',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: { preload: join(__dirname, '../preload/canvas.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  canvasWindow = window
  window.on('page-title-updated', event => event.preventDefault())
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, { type: 'warning', buttons: ['继续编辑', '关闭画布'], defaultId: 0, cancelId: 0, title: '关闭画布？', message: '画布和素材只在当前会话保留，关闭后将丢失。', detail: '正在进行的生成或导出也会中断。' })
    if (choice === 1) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show() })
  window.on('closed', () => { if (canvasWindow === window) canvasWindow = null })
  loading = !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    ? (() => { const url = new URL(process.env.ELECTRON_RENDERER_URL!); url.hash = 'whiteboard-canvas'; return window.loadURL(url.toString()) })()
    : window.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'whiteboard-canvas' })
  try { await loading } catch (error) { if (!window.isDestroyed()) window.destroy(); throw error } finally { loading = null }
}
export function isCanvasWindow(sender: WebContents): boolean {
  return !!canvasWindow && !canvasWindow.isDestroyed() && canvasWindow.webContents === sender
}
export function closeCanvasWindow(sender: WebContents): void {
  if (!isCanvasWindow(sender) || !canvasWindow) throw new Error('白板视频：无法关闭该窗口。')
  canvasWindow.close()
}
