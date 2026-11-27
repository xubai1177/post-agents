import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from 'electron'
import type { WorkspaceMenuAction } from '../shared/workspace'
import { join } from 'node:path'
import { registerSettings } from './ipc/settings-ipc'
import { registerDrafts } from './ipc/drafts-ipc'
import { registerTopics } from './ipc/topics-ipc'
import { registerDiscovery } from './ipc/discovery-ipc'
import { registerWhiteboard } from './ipc/whiteboard-ipc'
import { cancelAllRenders } from './features/whiteboard/project'
import { isCanvasWindow } from './features/whiteboard/canvas-window'
import { isVideoWindow, videoWindowIsBusy } from './features/whiteboard/video-window'
import { registerImages } from './ipc/images-ipc'
import { registerUpdates } from './features/updates/updates'
import { registerWorkspace } from './ipc/workspace-ipc'
import { loadEnvFile } from 'node:process'
import { release } from 'node:os'

// 保留原有数据目录，改名后仍可读取现有设置。
const existingUserDataPath = join(app.getPath('appData'), 'post-agents-app')
app.setName('灵稿 AI')
app.setPath('userData', existingUserDataPath)

function createWindow(): void {
  // Windows 的系统背景材质从 Windows 11 22H2 开始可用。
  const windowsBuild = Number(release().split('.')[2] ?? 0)
  const nativeGlass = process.platform === 'darwin' || (process.platform === 'win32' && windowsBuild >= 22621)
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: nativeGlass ? '#00000000' : '#f8fafc',
    transparent: nativeGlass,
    title: '灵稿 AI',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    ...(process.platform === 'win32' ? { titleBarStyle: 'hidden' as const, titleBarOverlay: { height: 44 } } : {}),
    ...(nativeGlass && process.platform === 'darwin' ? { vibrancy: 'under-window' as const, visualEffectState: 'followWindow' as const } : {}),
    ...(nativeGlass && process.platform === 'win32' ? { backgroundMaterial: 'acrylic' as const } : {}),
    icon: join(app.getAppPath(), 'src/renderer/public/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      additionalArguments: nativeGlass ? ['--native-window-glass'] : [],
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
  registerDiscovery()
  registerWhiteboard()
  registerUpdates()
  const workspaceAction = (action: WorkspaceMenuAction) => {
    const focused = BrowserWindow.getFocusedWindow()
    const isWorkbench = (candidate: BrowserWindow) => !isCanvasWindow(candidate.webContents) && !isVideoWindow(candidate.webContents)
    const window = focused && isWorkbench(focused) ? focused : BrowserWindow.getAllWindows().find(candidate => candidate.isVisible() && isWorkbench(candidate))
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
    if (!BrowserWindow.getAllWindows().some(window => window.isVisible())) createWindow()
  })
})

app.on('before-quit', event => {
  if (videoWindowIsBusy()) { event.preventDefault(); void dialog.showMessageBox({ type: 'info', buttons: ['继续处理'], message: '白板视频正在处理，请完成或取消后再退出应用。' }); return }
  cancelAllRenders()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
