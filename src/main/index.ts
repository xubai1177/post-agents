import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import type { WorkspaceMenuAction } from '../shared/workspace'
import { join } from 'node:path'
import { registerSettings } from './ipc/settings-ipc'
import { registerDrafts } from './ipc/drafts-ipc'
import { registerTopics } from './ipc/topics-ipc'
import { registerImages } from './ipc/images-ipc'
import { registerUpdates } from './features/updates/updates'
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
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    ...(process.platform === 'win32' ? { titleBarStyle: 'hidden' as const, titleBarOverlay: { height: 44 } } : {}),
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
  registerUpdates()
  const workspaceAction = (action: WorkspaceMenuAction) => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (window && !window.isDestroyed()) window.webContents.send('workspace:menu-action', action)
  }
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { label: '文件', submenu: [
      { label: '工作区', submenu: [
        { label: '打开已有工作区…', click: () => workspaceAction('open') },
        { label: '新建工作区…', click: () => workspaceAction('create') },
        { type: 'separator' },
        { label: '导入备份…', click: () => workspaceAction('import') },
        { label: '导出备份…', click: () => workspaceAction('export') }
      ] },
      { type: 'separator' },
      { label: '设置…', click: () => workspaceAction('settings') }
    ] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
