import { app, autoUpdater, BrowserWindow, ipcMain, net, shell } from 'electron'
import { MacUpdater, NsisUpdater } from 'electron-updater'
import type { UpdateState } from '../../../shared/updates'
import { fetchLatestRelease, updateOrigin } from './release-source'
import { respond } from '../../ipc/security'

const updater = !app.isPackaged ? null : process.platform === 'win32' ? new NsisUpdater() : process.platform === 'darwin' ? new MacUpdater() : null
if (updater) {
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.allowPrerelease = false
  updater.allowDowngrade = false
  updater.disableDifferentialDownload = true
  if (updater instanceof NsisUpdater) updater.disableWebInstaller = true
  updater.on('error', error => {
    if (state.status === 'installing') change({ status: 'error', errorStage: 'download', error: error.message.includes('read-only') ? '安装位置不可写，请将应用移到可写目录后重试。' : '更新校验失败，请重试。' })
  })
}
let state: UpdateState = {
  currentVersion: app.getVersion(),
  platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'unsupported',
  status: 'idle'
}
function change(patch: Partial<UpdateState>): UpdateState {
  state = { ...state, ...patch }
  for (const window of BrowserWindow.getAllWindows()) if (!window.webContents.isDestroyed()) window.webContents.send('updates:changed', state)
  return state
}
function newer(version: string, current: string): boolean {
  const left = version.split('.').map(Number), right = current.split('.').map(Number)
  return (left[0] - right[0] || left[1] - right[1] || left[2] - right[2]) > 0
}
async function check(): Promise<UpdateState> {
  if (['checking', 'downloading', 'downloaded', 'installing'].includes(state.status)) return state
  if (!app.isPackaged || state.platform === 'unsupported') return change({ status: 'error', error: '当前运行环境无法检查更新。', errorStage: 'check' })
  change({ status: 'checking', error: undefined, errorStage: undefined })
  try {
    const { version, notes } = await fetchLatestRelease((url, options) => net.fetch(url, options))
    if (!newer(version, state.currentVersion)) return change({ status: 'current', version: undefined, notes: undefined })
    const available = change({ status: 'available', version, notes })
    if (updater) void download()
    return available
  } catch (error) {
    return change({ status: 'error', errorStage: 'check', error: error instanceof Error && (error.message.startsWith('无法读取') || error.message.startsWith('更新信息')) ? error.message : '检查更新失败，请检查网络后重试。' })
  }
}
async function download(): Promise<void> {
  if (!updater || !state.version || !(state.status === 'available' || (state.status === 'error' && state.errorStage === 'download'))) throw new Error('无法下载更新。')
  const version = state.version
  change({ status: 'downloading', progress: 0, error: undefined, errorStage: undefined })
  try {
    updater.setFeedURL({ provider: 'generic', url: `${updateOrigin}/versions/v${version}/` })
    const result = await updater.checkForUpdates()
    const info = result?.updateInfo
    const expected = process.platform === 'darwin' ? [`linggao-ai-${version}-mac-arm64.zip`, `linggao-ai-${version}-mac-x64.zip`] : [`linggao-ai-${version}-win-x64.exe`]
    if (!result?.isUpdateAvailable || info?.version !== version || info.files.length !== expected.length || !expected.every(name => info.files.some(file => file.url === name))) throw new Error('更新文件与版本不匹配。')
    await updater.downloadUpdate()
    change({ status: 'downloaded', progress: 100 })
  } catch {
    change({ status: 'error', errorStage: 'download', error: '下载更新失败，请检查网络后重试。' })
  }
}
updater?.on('download-progress', info => change({ progress: Math.max(0, Math.min(100, Math.round(info.percent))) }))
export function registerUpdates(): void {
  ipcMain.handle('updates:state', event => respond(event, async () => state))
  ipcMain.handle('updates:check', event => respond(event, check))
  ipcMain.handle('updates:download', event => respond(event, async () => { void download() }))
  ipcMain.handle('updates:install', event => respond(event, async () => {
    if (!updater || state.status !== 'downloaded') throw new Error('更新尚未下载。')
    if (process.platform !== 'darwin') { updater.quitAndInstall(); return }
    change({ status: 'installing', error: undefined, errorStage: undefined })
    const cleanup = () => { autoUpdater.removeListener('update-downloaded', ready); autoUpdater.removeListener('error', failed) }
    const ready = () => { cleanup(); autoUpdater.quitAndInstall() }
    const failed = () => cleanup()
    autoUpdater.once('update-downloaded', ready)
    autoUpdater.once('error', failed)
    try { autoUpdater.checkForUpdates() } catch (error) { cleanup(); change({ status: 'error', errorStage: 'download', error: '更新校验失败，请重试。' }); throw error }
  }))
  ipcMain.handle('updates:open-release', event => respond(event, async () => {
    if (state.platform !== 'mac' || !state.version || !/^\d+\.\d+\.\d+$/.test(state.version)) throw new Error('版本信息无效。')
    const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null
    if (!arch) throw new Error('不支持当前处理器。')
    await shell.openExternal(`${updateOrigin}/versions/v${state.version}/linggao-ai-${state.version}-mac-${arch}.dmg`)
  }))
  if (app.isPackaged) setTimeout(() => { void check() }, 2000)
}
