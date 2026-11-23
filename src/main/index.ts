import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerSettings } from './ipc/settings-ipc'
import { registerDrafts } from './ipc/drafts-ipc'
import { registerTopics } from './ipc/topics-ipc'
import { registerImages } from './ipc/images-ipc'
import { registerWorkspace } from './ipc/workspace-ipc'
import { loadEnvFile } from 'node:process'

// 保留原有数据目录，改名后仍可读取现有设置。
const existingUserDataPath = join(app.getPath('appData'), 'post-agents-app')
app.setName('灵稿 AI')
app.setPath('userData', existingUserDataPath)

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#f8fafc',
    title: '灵稿 AI',
    icon: join(app.getAppPath(), 'src/renderer/public/icon.png'),
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
  if (process.platform === 'darwin') app.dock?.setIcon(join(app.getAppPath(), 'src/renderer/public/icon.png'))
  registerSettings()
  registerDrafts()
  registerImages()
  registerWorkspace()
  registerTopics()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
