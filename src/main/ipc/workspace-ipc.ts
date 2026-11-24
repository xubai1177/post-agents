import { BrowserWindow, dialog, ipcMain } from 'electron'
import { lstat, mkdir, readFile, rmdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { createBackup, decodeBackup, restoreBackup, writeBackupExclusive } from '../features/workspace/backup'
import { settingsForBackup, switchWorkspace, restoreWorkspaceSettings } from '../features/settings/settings'
import { isImageStyle } from '../../shared/image-styles'
import { isWorkspaceNodeId, type WorkspaceChange } from '../../shared/workspace'
import { getDraftsDirectory } from '../features/settings/settings'
import { changeWorkspaceIndex, deleteWorkspaceArticle, readWorkspaceIndex } from '../features/workspace/workspace-index'
import { respond } from './security'
import { articleQueue } from '../composition'

function validate(value: unknown): value is WorkspaceChange {
  if (!value || typeof value !== 'object') return false
  const change = value as Record<string, unknown>
  const str = (v: unknown) => typeof v === 'string' && v.length <= 200
  if (change.type === 'create') return str(change.name) && (change.parentId === null || str(change.parentId))
  if (change.type === 'rename') return str(change.id) && str(change.name)
  if (change.type === 'delete') return str(change.id)
  if (change.type === 'setImageStyle') return str(change.draftId) && isImageStyle(change.style)
  if (change.type === 'renameArticle') return str(change.draftId) && str(change.title) && str(change.expectedTitle)
  if (change.type === 'moveDraft') return str(change.draftId) && (change.folderId === null || str(change.folderId))
  if (change.type === 'reorder') return (change.parentId === null || str(change.parentId)) && isWorkspaceNodeId(change.node) && isWorkspaceNodeId(change.target) && (change.position === 'before' || change.position === 'after')
  return false
}
function validName(value: unknown): value is string { return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 100 && value !== '.' && value !== '..' && !/[\\/:*?"<>|\x00-\x1f]/.test(value) && !/[. ]$/.test(value) }
function validPassword(value: unknown): value is string { return typeof value === 'string' && value.length >= 8 && value.length <= 1024 }
function inside(root: string, file: string): boolean { const path = relative(root, file); return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !path.startsWith(sep)) }
export function registerWorkspace(): void {
  ipcMain.handle('workspace:read', (event) => respond(event, async () => {
    const directory = await getDraftsDirectory()
    return { ...await readWorkspaceIndex(directory), directory }
  }))
  ipcMain.handle('workspace:delete-article', (event, id: unknown) => respond(event, async () => {
    if (typeof id !== 'string' || !id || id.length > 255) throw new Error('工作空间操作：文章路径无效。')
    try { const root = await getDraftsDirectory(); if (articleQueue.isActive(root, id)) throw new Error('文章正在生成，请完成后再删除。'); return await deleteWorkspaceArticle(root, id) } catch (error) { throw new Error(`工作空间操作：${error instanceof Error ? error.message : '删除文章失败。'}`) }
  }))
  ipcMain.handle('workspace:change', (event, change: unknown) => respond(event, async () => {
    if (!validate(change)) throw new Error('目录操作无效。')
    try { return await changeWorkspaceIndex(await getDraftsDirectory(), change) } catch (error) { throw new Error(`工作空间操作：${error instanceof Error ? error.message.replaceAll('草稿', '文章') : '目录操作失败。'}`) }
  }))
  ipcMain.handle('workspace:open', (event) => respond(event, async () => {
    const window = BrowserWindow.fromWebContents(event.sender); if (!window) throw new Error('missing window')
    const result = await dialog.showOpenDialog(window, { title: '打开工作空间', properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    return switchWorkspace(result.filePaths[0])
  }))
  ipcMain.handle('workspace:create', (event, name: unknown) => respond(event, async () => {
    if (!validName(name)) throw new Error('工作空间操作：工作空间名称无效。')
    const window = BrowserWindow.fromWebContents(event.sender); if (!window) throw new Error('missing window')
    const result = await dialog.showOpenDialog(window, { title: '选择新工作空间的上级目录', properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const target = join(result.filePaths[0], name)
    try { await mkdir(target) } catch { throw new Error('工作空间操作：无法创建目录，名称可能已存在。') }
    try { return await switchWorkspace(target) } catch (error) { try { await rmdir(target) } catch { /* Preserve any contents created concurrently. */ } throw error }
  }))
  ipcMain.handle('workspace:export', (event, password: unknown) => respond(event, async () => {
    if (!validPassword(password)) throw new Error('工作空间操作：密码至少需要 8 个字符。')
    const window = BrowserWindow.fromWebContents(event.sender), root = await getDraftsDirectory(); if (!window || !root) throw new Error('工作空间操作：请先打开工作空间。')
    const result = await dialog.showSaveDialog(window, { title: '导出加密工作空间', defaultPath: '工作空间.postbackup', filters: [{ name: '工作空间备份', extensions: ['postbackup'] }] })
    if (result.canceled || !result.filePath) return false
    if (inside(root, result.filePath)) throw new Error('工作空间操作：请将备份保存到工作空间以外的位置。')
    try { const bytes = await createBackup(root, await settingsForBackup(), password); await writeBackupExclusive(result.filePath, bytes); return true } catch (error) { throw new Error(`工作空间操作：${error instanceof Error ? error.message : '备份失败。'}`) }
  }))
  ipcMain.handle('workspace:import', (event, password: unknown, name: unknown) => respond(event, async () => {
    if (!validPassword(password) || !validName(name)) throw new Error('工作空间操作：密码或工作空间名称无效。')
    const window = BrowserWindow.fromWebContents(event.sender); if (!window) throw new Error('missing window')
    const file = await dialog.showOpenDialog(window, { title: '选择加密备份', properties: ['openFile'], filters: [{ name: '工作空间备份', extensions: ['postbackup'] }] })
    if (file.canceled || !file.filePaths[0]) return null
    const stat = await lstat(file.filePaths[0]); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 384 * 1024 * 1024) throw new Error('工作空间操作：备份文件无效或过大。')
    let snapshot
    try { snapshot = await decodeBackup(await readFile(file.filePaths[0]), password) } catch (error) { throw new Error(`工作空间操作：${error instanceof Error ? error.message : '备份无法读取。'}`) }
    const parent = await dialog.showOpenDialog(window, { title: '选择恢复工作空间的上级目录', properties: ['openDirectory'] })
    if (parent.canceled || !parent.filePaths[0]) return null
    const target = join(parent.filePaths[0], name)
    try { await mkdir(target) } catch { throw new Error('工作空间操作：无法创建目录，名称可能已存在。') }
    try { await restoreBackup(snapshot, target); return await restoreWorkspaceSettings(target, snapshot.settings) } catch (error) { throw new Error(`工作空间操作：${error instanceof Error ? error.message : '恢复失败。'} 部分恢复的文件保留在 ${target}，请检查后手动处理。`) }
  }))

}
