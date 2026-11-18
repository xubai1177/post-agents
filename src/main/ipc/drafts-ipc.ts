import { ipcMain, shell } from 'electron'
import { platforms, type CreateRequest, type CreateResult, type Platform } from '../../shared/drafts'
import { getDraftsDirectory } from '../features/settings/settings'
import { listDrafts, readDraft, saveDraft } from '../features/drafts/draft-store'
import { readResearch } from '../features/research/research'
import { createContent } from '../composition'
import { ResearchUnavailableError } from '../errors'
import { respond } from './security'
import type { GenerationProgress } from '../../shared/research'

function isPlatform(value: unknown): value is Platform { return typeof value === 'string' && platforms.some((p) => p === value) }
function validateRequest(value: unknown): value is CreateRequest {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (r.research === 'online' || r.research === 'skip') && typeof r.title === 'string' && !!r.title.trim() && r.title.length <= 100 && typeof r.audience === 'string' && r.audience.length <= 500 && Array.isArray(r.platforms) && r.platforms.length > 0 && r.platforms.length <= platforms.length && r.platforms.every(isPlatform) && new Set(r.platforms).size === r.platforms.length
}
function safeMessage(error: unknown): string {
  if (error instanceof Error && ['请先在设置中选择草稿目录。', '请先在设置中配置模型地址、模型名称和密钥。', '已有同名主题，请更换主题名称。', '主题不能作为文件夹名称。', '文件已被外部修改，请重新打开后再保存。', '草稿不存在或路径无效。', '草稿文件无效。', '文案内容无效。', '联网核查不可用或没有找到来源，请重试或选择继续生成未核查草稿。', '内容策划失败，请重试。'].includes(error.message)) return error.message
  return '操作失败，请检查目录、模型配置或网络连接。'
}
function handle<T>(event: Electron.IpcMainInvokeEvent, run: () => Promise<T>) {
  return respond(event, async () => { try { return await run() } catch (error) { if (error instanceof ResearchUnavailableError) throw error; throw new Error(`草稿操作：${safeMessage(error)}`) } })
}
export function registerDrafts(): void {
  ipcMain.handle('drafts:list', (event) => handle(event, async () => listDrafts(await getDraftsDirectory())))
  ipcMain.handle('drafts:read', (event, id: unknown, platform: unknown) => handle(event, async () => {
    if (typeof id !== 'string' || !isPlatform(platform)) throw new Error('invalid input')
    return readDraft(await getDraftsDirectory(), id, platform)
  }))
  ipcMain.handle('drafts:save', (event, id: unknown, platform: unknown, content: unknown, version: unknown) => handle(event, async () => {
    if (typeof id !== 'string' || !isPlatform(platform) || typeof content !== 'string' || typeof version !== 'string') throw new Error('invalid input')
    return saveDraft(await getDraftsDirectory(), id, platform, content, version)
  }))
  ipcMain.handle('drafts:research', (event, id: unknown) => handle(event, async () => {
    if (typeof id !== 'string') throw new Error('invalid input')
    return readResearch(await getDraftsDirectory(), id)
  }))
  ipcMain.handle('drafts:open-source', (event, id: unknown, url: unknown) => handle(event, async () => {
    if (typeof id !== 'string' || typeof url !== 'string' || url.length > 4096) throw new Error('invalid input')
    const record = await readResearch(await getDraftsDirectory(), id)
    if (!record?.sources.some((source) => source.url === url)) throw new Error('invalid source')
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) throw new Error('invalid url')
    await shell.openExternal(parsed.href)
  }))
  ipcMain.handle('drafts:generate', (event, request: unknown) => handle(event, async (): Promise<CreateResult> => {
    if (!validateRequest(request)) throw new Error('invalid input')
    const progress = (phase: GenerationProgress) => { if (!event.sender.isDestroyed()) event.sender.send('drafts:progress', phase) }
    return createContent(request, progress)
  }))
}
