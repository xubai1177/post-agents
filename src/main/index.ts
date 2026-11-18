import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerSettings } from './ipc/settings-ipc'
import { registerDrafts } from './ipc/drafts-ipc'
import { registerTopics } from './ipc/topics-ipc'
import { registerImages } from './ipc/images-ipc'
import { loadEnvFile } from 'node:process'

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

try { loadEnvFile(join(app.getAppPath(), '.env')) } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('无法读取本地模型配置。')
}

app.whenReady().then(() => {
  registerSettings()
  registerDrafts()
  registerImages()
  registerTopics()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
