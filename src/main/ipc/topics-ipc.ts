import { startBatchArticles, taskWithArticleRun } from '../features/topics/batch-articles'
import { articleQueue, onArticleQueueChanged } from '../composition'
import { assertAvailableArticleTitle, changeWorkspaceIndex, ensureWorkspaceIndex } from '../features/workspace/workspace-index'
import { isImageStyle } from '../../shared/image-styles'
import { ipcMain, shell, type WebContents } from 'electron'
import { platforms } from '../../shared/drafts'
import { defaultTopicCount, isTopicCount } from '../../shared/topics'
import type { TopicRequest } from '../../shared/topics'
import { validateTopicWorkspace, updateTopicWorkspace } from '../features/topics/topic-store'
import { getDraftsDirectory } from '../features/settings/settings'
import { onTopicQueueChanged, topicQueue } from '../composition'
import { respond } from './security'

const listeners = new Set<WebContents>()
const allowedSources = new Map<number, Set<string>>()
function track(sender: WebContents) {
  if (listeners.has(sender)) return
  listeners.add(sender)
  sender.once('destroyed', () => { listeners.delete(sender); allowedSources.delete(sender.id) })
}
function validRequest(value: unknown): value is TopicRequest {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (r.count === undefined || isTopicCount(r.count)) && typeof r.direction === 'string' && !!r.direction.trim() && r.direction.length <= 100 && typeof r.audience === 'string' && r.audience.length <= 500 && Array.isArray(r.platforms) && r.platforms.length > 0 && r.platforms.length <= platforms.length && r.platforms.every((p: unknown) => typeof p === 'string' && platforms.some(name => name === p)) && new Set(r.platforms).size === r.platforms.length
}
export function registerTopics(): void {
  onTopicQueueChanged(() => { for (const sender of listeners) { if (sender.isDestroyed()) { listeners.delete(sender); continue }; try { sender.send('topics:changed') } catch { listeners.delete(sender); console.warn('无法通知已关闭的选题窗口。') } } })
  ipcMain.handle('topics:read-records', (event) => respond(event, async () => {
    track(event.sender)
    const data = await topicQueue.load(await getDraftsDirectory())
    const allowed = allowedSources.get(event.sender.id) ?? new Set<string>()
    for (const record of data.batches) for (const source of record.batch.sources) allowed.add(source.url)
    allowedSources.set(event.sender.id, allowed)
    const runs = await articleQueue.load(await getDraftsDirectory())
    return { ...data, tasks: data.tasks.map(task => taskWithArticleRun(task, runs)) }
  }))
  onArticleQueueChanged(() => { for (const sender of listeners) { if (!sender.isDestroyed()) sender.send('topics:changed') } })
  ipcMain.handle('topics:start-batch', (event, value: unknown) => respond(event, async () => {
    if (!value || typeof value !== 'object') throw new Error('选题操作：批量创建参数无效。')
    const input = value as Record<string, unknown>
    if (typeof input.batchId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(input.batchId) || !Array.isArray(input.indexes) || !input.indexes.length || input.indexes.length > 100 || !input.indexes.every(i => Number.isInteger(i) && i >= 0 && i < 100) || new Set(input.indexes).size !== input.indexes.length || !Array.isArray(input.platforms) || !input.platforms.length || !input.platforms.every(p => platforms.includes(p)) || new Set(input.platforms).size !== input.platforms.length || !isImageStyle(input.imageStyle) || typeof input.generateImages !== 'boolean' || typeof input.folderId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(input.folderId)) throw new Error('选题操作：批量创建参数无效。')
    const root = await getDraftsDirectory()
    await topicQueue.load(root)
    track(event.sender)
    await startBatchArticles(root, { batchId: input.batchId, indexes: input.indexes, platforms: input.platforms, imageStyle: input.imageStyle, generateImages: input.generateImages, folderId: input.folderId }, { update: updateTopicWorkspace, start: (dir, options) => articleQueue.start(dir, options), assertTitle: assertAvailableArticleTitle,
      ensureFolder: async (dir, batchId, parentId, name) => { const index = await changeWorkspaceIndex(dir, { type: 'ensureTopicFolder', batchId, parentId, name }); const id = index.topicFolders?.[batchId]; if (!id) throw new Error('选题操作：无法创建选题文件夹。'); return id },
      assignFolder: async (dir, id, folderId) => { try { await changeWorkspaceIndex(dir, { type: 'moveDraft', draftId: id, folderId }) } catch (error) { const fallback = await ensureWorkspaceIndex(dir); if (fallback.defaultFolderId) await changeWorkspaceIndex(dir, { type: 'moveDraft', draftId: id, folderId: fallback.defaultFolderId }); throw error } } })
  }))
  ipcMain.handle('topics:save-records', (event, value: unknown) => respond(event, async () => {
    try {
      const incoming = validateTopicWorkspace(value)
      return await updateTopicWorkspace(await getDraftsDirectory(), current => ({ ...current, tasks: incoming.tasks }))
    } catch { throw new Error('选题操作：无法保存文章任务，请检查工作空间和磁盘权限。') }
  }))
  ipcMain.handle('topics:start', (event, request: unknown) => respond(event, async () => {
    if (!validRequest(request)) throw new Error('选题操作：选题参数无效，请检查内容方向和生成数量。')
    track(event.sender)
    await topicQueue.enqueue(await getDraftsDirectory(), { direction: request.direction.trim(), audience: request.audience.trim(), platforms: [...request.platforms], count: request.count ?? defaultTopicCount })
  }))
  ipcMain.handle('topics:retry', (event, id: unknown, mode: unknown) => respond(event, async () => {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id) || (mode !== 'retry' && mode !== 'skip')) throw new Error('选题操作：任务参数无效。')
    track(event.sender)
    await topicQueue.retry(await getDraftsDirectory(), id, mode)
  }))
  ipcMain.handle('topics:open-source', (event, url: unknown) => respond(event, async () => {
    if (typeof url !== 'string' || url.length > 4096 || !allowedSources.get(event.sender.id)?.has(url)) throw new Error('invalid source')
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) throw new Error('invalid url')
    await shell.openExternal(parsed.href)
  }))
}
