import { app, BrowserWindow, dialog, type WebContents } from 'electron'
import { join } from 'node:path'

let videoWindow: BrowserWindow | null = null
let workspaceRoot = ''
let loading: Promise<void> | null = null
let state = { busy: false, dirty: false }

export async function openVideoWindow(root: string): Promise<void> {
  if (videoWindow && !videoWindow.isDestroyed()) {
    if (loading) await loading
    if (videoWindow && !videoWindow.isDestroyed()) { if (videoWindow.isMinimized()) videoWindow.restore(); videoWindow.show(); videoWindow.focus() }
    return
  }
  if (!root) throw new Error('白板视频：请先打开工作区。')
  const window = new BrowserWindow({
    width: 1200, height: 800, minWidth: 800, minHeight: 600, show: false,
    title: '白板视频 · 灵稿 AI', backgroundColor: '#f5f6f9',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: { preload: join(__dirname, '../preload/video.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  videoWindow = window; workspaceRoot = root; state = { busy: false, dirty: false }
  window.on('page-title-updated', event => event.preventDefault())
  window.on('close', event => {
    if (state.busy) {
      event.preventDefault()
      void dialog.showMessageBox(window, { type: 'info', buttons: ['继续处理'], message: '白板视频正在处理，请完成或取消后再关闭窗口。' })
    } else if (state.dirty) {
      const choice = dialog.showMessageBoxSync(window, { type: 'warning', buttons: ['继续编辑', '放弃修改'], defaultId: 0, cancelId: 0, message: '分镜有未保存的修改，关闭窗口会丢失这些修改。' })
      if (choice !== 1) event.preventDefault()
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show() })
  window.on('closed', () => { if (videoWindow === window) { videoWindow = null; workspaceRoot = ''; state = { busy: false, dirty: false } } })
  loading = !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    ? (() => { const url = new URL(process.env.ELECTRON_RENDERER_URL!); url.hash = 'whiteboard-video'; return window.loadURL(url.toString()) })()
    : window.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'whiteboard-video' })
  try { await loading } catch (error) { if (!window.isDestroyed()) window.destroy(); throw error } finally { loading = null }
}
export function isVideoWindow(sender: WebContents): boolean { return !!videoWindow && !videoWindow.isDestroyed() && videoWindow.webContents === sender }
export function videoWindowIsBusy(): boolean { return !!videoWindow && !videoWindow.isDestroyed() && state.busy }
export function videoWorkspace(sender: WebContents): string { if (!isVideoWindow(sender)) throw new Error('白板视频：窗口无效。'); return workspaceRoot }
export function setVideoWindowState(sender: WebContents, busy: unknown, dirty: unknown): void {
  if (isVideoWindow(sender) && typeof busy === 'boolean' && typeof dirty === 'boolean') state = { busy, dirty }
}
