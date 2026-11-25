import { BrowserWindow, dialog, ipcMain } from 'electron'
import { lstat, mkdir, readFile, rmdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { decodeBackup, restoreBackup } from '../features/workspace/backup'
import { exportStreamBackup, isStreamBackup, restoreStreamBackup, verifyStreamBackup } from '../features/workspace/stream-backup'
import { settingsForBackup, switchWorkspace, restoreWorkspaceSettings, listWorkspaces } from '../features/settings/settings'
import { isImageStyle } from '../../shared/image-styles'
import { isWorkspaceNodeId, type DeleteNodesPlan, type WorkspaceChange } from '../../shared/workspace'
import { getDraftsDirectory } from '../features/settings/settings'
import { changeWorkspaceIndex, ensureWorkspaceIndex, deleteWorkspaceArticle, deleteWorkspaceNodes, previewDeleteNodes, readWorkspaceIndex } from '../features/workspace/workspace-index'
import { respond } from './security'
import { articleQueue } from '../composition'

function validate(value: unknown): value is WorkspaceChange {
  if (!value || typeof value !== 'object') return false
  const change = value as Record<string, unknown>
  const str = (v: unknown) => typeof v === 'string' && v.length <= 200
  if (change.type === 'setGenerationFolder') return str(change.id)
  if (change.type === 'ensureTopicFolder') return str(change.batchId) && /^[a-zA-Z0-9-]{1,80}$/.test(change.batchId as string) && str(change.name) && str(change.parentId)
  if (change.type === 'create') return str(change.name) && (change.parentId === null || str(change.parentId))
  if (change.type === 'rename') return str(change.id) && str(change.name)
  if (change.type === 'delete') return str(change.id)
  if (change.type === 'setImageStyle') return str(change.draftId) && isImageStyle(change.style)
  if (change.type === 'renameArticle') return str(change.draftId) && str(change.title) && str(change.expectedTitle)
  if (change.type === 'moveNodes') return Array.isArray(change.nodes) && change.nodes.length > 0 && change.nodes.length <= 1000 && change.nodes.every(isWorkspaceNodeId) && (change.folderId === null || str(change.folderId))
  if (change.type === 'moveDraft') return str(change.draftId) && (change.folderId === null || str(change.folderId))
  if (change.type === 'reorder') return (change.parentId === null || str(change.parentId)) && isWorkspaceNodeId(change.node) && isWorkspaceNodeId(change.target) && (change.position === 'before' || change.position === 'after')
  return false
}
function validName(value: unknown): value is string { return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 100 && value !== '.' && value !== '..' && !/[\\/:*?"<>|\x00-\x1f]/.test(value) && !/[. ]$/.test(value) }
function validPassword(value: unknown): value is string { return typeof value === 'string' && (value.length === 0 || (value.length >= 8 && value.length <= 1024)) }
function inside(root: string, file: string): boolean { const path = relative(root, file); return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !path.startsWith(sep)) }
export function registerWorkspace(): void {
  ipcMain.handle('workspace:list', (event) => respond(event, () => listWorkspaces()))
  ipcMain.handle('workspace:switch', (event, directory: unknown) => respond(event, async () => {
    if (typeof directory !== 'string' || !directory || directory.length > 4096 || directory.includes('\0')) throw new Error('工作区操作：工作区目录无效。')
    return switchWorkspace(directory, true)
  }))
  ipcMain.handle('workspace:read', (event) => respond(event, async () => {
    const directory = await getDraftsDirectory()
    return { ...await ensureWorkspaceIndex(directory), directory }
  }))
  const validNodes = (nodes: unknown): nodes is import('../../shared/workspace').WorkspaceNodeId[] => Array.isArray(nodes) && nodes.length > 0 && nodes.length <= 1000 && nodes.every(isWorkspaceNodeId)
  ipcMain.handle('workspace:preview-delete-nodes', (event, nodes: unknown) => respond(event, async () => {
    if (!validNodes(nodes)) throw new Error('工作区操作：删除项目无效。')
    try { return await previewDeleteNodes(await getDraftsDirectory(), nodes) } catch (error) { throw new Error(`工作区操作：${error instanceof Error ? error.message : '无法读取删除范围。'}`) }
  }))
  ipcMain.handle('workspace:delete-nodes', (event, value: unknown) => respond(event, async () => {
    if (!value || typeof value !== 'object') throw new Error('工作区操作：删除范围无效。')
    const plan = value as Partial<DeleteNodesPlan>
    if (!validNodes(plan.nodes) || !Array.isArray(plan.folderIds) || !Array.isArray(plan.articleIds) || !plan.folderIds.every(id => typeof id === 'string') || !plan.articleIds.every(id => typeof id === 'string')) throw new Error('工作区操作：删除范围无效。')
    const root = await getDraftsDirectory()
    try { return await deleteWorkspaceNodes(root, { nodes: plan.nodes, folderIds: plan.folderIds, articleIds: plan.articleIds }, id => articleQueue.isActive(root, id)) } catch (error) { throw new Error(`工作区操作：${error instanceof Error ? error.message : '删除失败。'}`) }
  }))
  ipcMain.handle('workspace:delete-article', (event, id: unknown) => respond(event, async () => {
    if (typeof id !== 'string' || !id || id.length > 255) throw new Error('工作区操作：文章路径无效。')
    try { const root = await getDraftsDirectory(); if (articleQueue.isActive(root, id)) throw new Error('文章正在生成，请完成后再删除。'); return await deleteWorkspaceArticle(root, id) } catch (error) { throw new Error(`工作区操作：${error instanceof Error ? error.message : '删除文章失败。'}`) }
  }))
  ipcMain.handle('workspace:change', (event, change: unknown) => respond(event, async () => {
    if (!validate(change)) throw new Error('目录操作无效。')
    try { return await changeWorkspaceIndex(await getDraftsDirectory(), change) } catch (error) { throw new Error(`工作区操作：${error instanceof Error ? error.message.replaceAll('草稿', '文章') : '目录操作失败。'}`) }
  }))
  ipcMain.handle('workspace:open', (event) => respond(event, async () => {
    const window = BrowserWindow.fromWebContents(event.sender); if (!window) throw new Error('missing window')
    const result = await dialog.showOpenDialog(window, { title: '打开工作区', properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    return switchWorkspace(result.filePaths[0])
  }))
  ipcMain.handle('workspace:create', (event, name: unknown) => respond(event, async () => {
    if (!validName(name)) throw new Error('工作区操作：工作区名称无效。')
    const window = BrowserWindow.fromWebContents(event.sender); if (!window) throw new Error('missing window')
    const result = await dialog.showOpenDialog(window, { title: '选择新工作区的上级目录', properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const target = join(result.filePaths[0], name)
    try { await mkdir(target) } catch { throw new Error('工作区操作：无法创建目录，名称可能已存在。') }
    try { return await switchWorkspace(target) } catch (error) { try { await rmdir(target) } catch { /* Preserve any contents created concurrently. */ } throw error }
  }))
  ipcMain.handle('workspace:export', (event, password: unknown) => respond(event, async () => {
    if (!validPassword(password)) throw new Error('工作区操作：密码留空或输入 8 至 1024 个字符。')
    const window = BrowserWindow.fromWebContents(event.sender), root = await getDraftsDirectory(); if (!window || !root) throw new Error('工作区操作：请先打开工作区。')
    const result = await dialog.showSaveDialog(window, { title: '导出工作区备份', defaultPath: '工作区.postbackup', filters: [{ name: '工作区备份', extensions: ['postbackup'] }] })
    if (result.canceled || !result.filePath) return false
    if (inside(root, result.filePath)) throw new Error('工作区操作：请将备份保存到工作区以外的位置。')
    try { await exportStreamBackup(root, result.filePath, await settingsForBackup(Boolean(password)), password, progress => { if (!event.sender.isDestroyed()) event.sender.send('workspace:export-progress', progress) }); return true } catch (error) { throw new Error(`工作区操作：${error instanceof Error ? error.message : '备份失败。'}`) }
  }))
  ipcMain.handle('workspace:import', (event, password: unknown, name: unknown) => respond(event, async () => {
    if (!validPassword(password) || !validName(name)) throw new Error('工作区操作：密码或工作区名称无效。')
    const window = BrowserWindow.fromWebContents(event.sender); if (!window) throw new Error('missing window')
    const file = await dialog.showOpenDialog(window, { title: '选择工作区备份', properties: ['openFile'], filters: [{ name: '工作区备份', extensions: ['postbackup'] }] })
    if (file.canceled || !file.filePaths[0]) return null
    const stat = await lstat(file.filePaths[0]); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('工作区操作：备份文件无效。')
    let snapshot: Awaited<ReturnType<typeof decodeBackup>> | undefined
    let streaming = false
    try { streaming = await isStreamBackup(file.filePaths[0]); if (streaming) await verifyStreamBackup(file.filePaths[0], password); else snapshot = await decodeBackup(await readFile(file.filePaths[0]), password) } catch (error) { throw new Error(`工作区操作：${error instanceof Error ? error.message : '备份无法读取。'}`) }
    const parent = await dialog.showOpenDialog(window, { title: '选择恢复工作区的上级目录', properties: ['openDirectory'] })
    if (parent.canceled || !parent.filePaths[0]) return null
    const target = join(parent.filePaths[0], name)
    try { await mkdir(target) } catch { throw new Error('工作区操作：无法创建目录，名称可能已存在。') }
    try { const settings = streaming ? await restoreStreamBackup(file.filePaths[0], password, target) : (await restoreBackup(snapshot!, target), snapshot!.settings); return await restoreWorkspaceSettings(target, settings) } catch (error) { throw new Error(`工作区操作：${error instanceof Error ? error.message : '恢复失败。'} 部分恢复的文件保留在 ${target}，请检查后手动处理。`) }
  }))

}
