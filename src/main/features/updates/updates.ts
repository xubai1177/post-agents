import { app, BrowserWindow, ipcMain, net, shell } from 'electron'
import { NsisUpdater } from 'electron-updater'
import type { UpdateState } from '../../../shared/updates'
import { respond } from '../../ipc/security'

const repo = 'xubai1177/post-agents'
const updater = process.platform === 'win32' && app.isPackaged ? new NsisUpdater() : null
if (updater) {
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.allowPrerelease = false
  updater.allowDowngrade = false
  updater.disableDifferentialDownload = true
  updater.disableWebInstaller = true
  updater.on('error', () => {})
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
  if (['checking', 'downloading', 'downloaded'].includes(state.status)) return state
  if (!app.isPackaged || state.platform === 'unsupported') return change({ status: 'error', error: '当前运行环境无法检查更新。', errorStage: 'check' })
  change({ status: 'checking', error: undefined })
  try {
    const response = await net.fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(12000), redirect: 'error' })
    if (!response.ok) throw new Error('无法读取 GitHub 正式版本，请检查网络和仓库访问权限。')
    const release: unknown = await response.json()
    if (!release || typeof release !== 'object' || !('tag_name' in release) || typeof release.tag_name !== 'string' || !/^v\d+\.\d+\.\d+$/.test(release.tag_name) || !('draft' in release) || release.draft !== false || !('prerelease' in release) || release.prerelease !== false) throw new Error('版本信息无效，请稍后重试。')
    const version = release.tag_name.slice(1)
    if (!newer(version, state.currentVersion)) return change({ status: 'current', version: undefined, notes: undefined })
    const notes = 'body' in release && typeof release.body === 'string' ? release.body.slice(0, 30000) : ''
    return change({ status: 'available', version, notes })
  } catch (error) {
    return change({ status: 'error', errorStage: 'check', error: error instanceof Error && error.message.startsWith('无法读取') ? error.message : '检查更新失败，请检查网络后重试。' })
  }
}
async function download(): Promise<void> {
  if (!updater || !state.version || !(state.status === 'available' || (state.status === 'error' && state.errorStage === 'download'))) throw new Error('无法下载更新。')
  const version = state.version
  change({ status: 'downloading', progress: 0, error: undefined })
  try {
    updater.setFeedURL({ provider: 'generic', url: `https://github.com/${repo}/releases/download/v${version}/` })
    const result = await updater.checkForUpdates()
    const info = result?.updateInfo
    if (!result?.isUpdateAvailable || info?.version !== version || info.files.length !== 1 || info.files[0].url !== `linggao-ai-${version}-win-x64.exe`) throw new Error('更新文件与版本不匹配。')
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
    updater.quitAndInstall()
  }))
  ipcMain.handle('updates:open-release', event => respond(event, async () => {
    if (state.platform !== 'mac' || !state.version || !/^\d+\.\d+\.\d+$/.test(state.version)) throw new Error('版本信息无效。')
    await shell.openExternal(`https://github.com/${repo}/releases/tag/v${state.version}`)
  }))
  if (app.isPackaged) setTimeout(() => { void check() }, 2000)
}
