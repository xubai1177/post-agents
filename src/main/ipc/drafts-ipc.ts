import { ipcMain, shell, type WebContents } from 'electron'
import { platforms, type CreateRequest, type CreateResult, type Platform } from '../../shared/drafts'
import { getDraftsDirectory } from '../features/settings/settings'
import { listDrafts, readDraft, saveDraft, readPlatformTitle, savePlatformTitle } from '../features/drafts/draft-store'
import { readResearch, readPlatformResearch } from '../features/research/research'
import { articleQueue, createContent, onArticleQueueChanged, regenerateArticle, optimizeArticle, createTitles, testPlatformRules } from '../composition'
import { generateDrafts } from '../features/content/generation'
import { assertAvailableArticleTitle } from '../features/workspace/workspace-index'
import { ResearchUnavailableError } from '../errors'
import { respond } from './security'
import { notifyGeneration } from '../infrastructure/notifications'
import type { GenerationProgress } from '../../shared/research'
import { isImageStyle } from '../../shared/image-styles'
import { changeWorkspaceIndex } from '../features/workspace/workspace-index'

const articleListeners = new Set<WebContents>()
function trackArticleListener(sender: WebContents): void {
  if (articleListeners.has(sender)) return
  articleListeners.add(sender)
  sender.once('destroyed', () => articleListeners.delete(sender))
}

function isPlatform(value: unknown): value is Platform { return typeof value === 'string' && platforms.some((p) => p === value) }
function validateRequest(value: unknown): value is CreateRequest {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (r.research === 'online' || r.research === 'skip') && typeof r.title === 'string' && !!r.title.trim() && r.title.length <= 100 && typeof r.audience === 'string' && r.audience.length <= 500 && (r.angle === undefined || (typeof r.angle === 'string' && r.angle.length <= 2000)) && Array.isArray(r.platforms) && r.platforms.length > 0 && r.platforms.length <= platforms.length && r.platforms.every(isPlatform) && new Set(r.platforms).size === r.platforms.length
}
function safeMessage(error: unknown): string {
  if (error instanceof Error && error.message.startsWith('文章操作：')) return error.message.slice('文章操作：'.length)
  if (error instanceof Error && ['请先在设置中选择草稿目录。', '请先在设置中配置模型地址、模型名称和密钥。', '已有同名主题，请更换主题名称。', '主题不能作为文件夹名称。', '文件已被外部修改，请重新打开后再保存。', '草稿不存在或路径无效。', '草稿文件无效。', '文案内容无效。', '平台标题无效。', '标题文件无效。', '平台标题已被外部修改，请重新打开后重试。', '联网核查不可用或没有找到来源，请重试或选择继续生成未核查草稿。', '文章为空或超过优化长度限制。', '文章已在外部修改，请重新打开后再优化。', '优化期间文章已在外部修改，请重新打开后重试。', '优化结果为空或过长，请重试。'].includes(error.message)) return error.message
  return '操作失败，请检查目录、模型配置或网络连接。'
}
function handle<T>(event: Electron.IpcMainInvokeEvent, run: () => Promise<T>) {
  return respond(event, async () => { try { return await run() } catch (error) { if (error instanceof ResearchUnavailableError) throw error; throw new Error(`文章操作：${safeMessage(error).replaceAll('草稿目录', '工作空间').replaceAll('草稿', '文章')}`) } })
}
export function registerDrafts(): void {
  ipcMain.handle('drafts:test-platform-prompt', (event, value: unknown) => handle(event, async () => {
    if (!value || typeof value !== 'object') throw new Error('文章操作：测试参数无效。')
    const r = value as Record<string, unknown>
    if (!isPlatform(r.platform) || typeof r.rule !== 'string' || r.rule.length > 4000 || r.rule.includes('\0')) throw new Error('文章操作：测试参数无效。')
    if (r.kind === 'body' && typeof r.topic === 'string' && !!r.topic.trim() && r.topic.length <= 100) return testPlatformRules({ kind: 'body', platform: r.platform, topic: r.topic, rule: r.rule })
    if (r.kind === 'title' && typeof r.content === 'string' && !!r.content.trim() && r.content.length <= 60000) return testPlatformRules({ kind: 'title', platform: r.platform, content: r.content, rule: r.rule })
    throw new Error('文章操作：测试参数无效。')
  }))
  ipcMain.handle('drafts:generate-titles', (event, value: unknown) => handle(event, async () => {
    if (!value || typeof value !== 'object') throw new Error('文章操作：生成参数无效。')
    const r = value as Record<string, unknown>
    if (typeof r.id !== 'string' || r.id.length > 200 || !isPlatform(r.platform) || typeof r.version !== 'string' || !/^[a-f0-9]{64}$/.test(r.version) || typeof r.content !== 'string' || r.content.length > 60000) throw new Error('文章操作：生成参数无效。')
    return createTitles({ id: r.id, platform: r.platform, version: r.version, content: r.content })
  }))
  onArticleQueueChanged(() => { for (const sender of articleListeners) { if (sender.isDestroyed()) { articleListeners.delete(sender); continue }; try { sender.send('drafts:articles-changed') } catch { articleListeners.delete(sender) } } })
  ipcMain.handle('drafts:article-runs', (event) => handle(event, async () => { trackArticleListener(event.sender); return articleQueue.load(await getDraftsDirectory()) }))
  ipcMain.handle('drafts:start-article', (event, value: unknown) => handle(event, async () => {
    if (!value || typeof value !== 'object') throw new Error('文章操作：创建参数无效。')
    const input = value as Record<string, unknown>
    if (!validateRequest(input.request) || !isImageStyle(input.imageStyle) || typeof input.generateImages !== 'boolean' || !(input.folderId === null || (typeof input.folderId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(input.folderId)))) throw new Error('文章操作：创建参数无效。')
    const root = await getDraftsDirectory()
    if (!root) throw new Error('请先在设置中选择草稿目录。')
    await assertAvailableArticleTitle(root, input.request.title)
    trackArticleListener(event.sender)
    const draft = await articleQueue.start(root, { request: input.request, imageStyle: input.imageStyle, generateImages: input.generateImages, folderId: input.folderId })
    let warning: string | undefined
    try {
      await changeWorkspaceIndex(root, { type: 'setImageStyle', draftId: draft.id, style: input.imageStyle })
      if (input.folderId) await changeWorkspaceIndex(root, { type: 'moveDraft', draftId: draft.id, folderId: input.folderId })
    } catch { warning = '文章已创建，但文件夹或图片风格保存失败，请检查设置。' }
    return { draft, ...(warning ? { warning } : {}) }
  }))
  ipcMain.handle('drafts:retry-article', (event, id: unknown, skipResearch: unknown) => handle(event, async () => {
    if (typeof id !== 'string' || !id || id === '.' || id === '..' || /[\\/\0]/.test(id) || id.length > 255 || typeof skipResearch !== 'boolean') throw new Error('文章操作：任务参数无效。')
    trackArticleListener(event.sender)
    await articleQueue.retry(await getDraftsDirectory(), id, skipResearch)
  }))
  ipcMain.handle('drafts:list', (event) => handle(event, async () => listDrafts(await getDraftsDirectory())))
  ipcMain.handle('drafts:read', (event, id: unknown, platform: unknown) => handle(event, async () => {
    if (typeof id !== 'string' || !isPlatform(platform)) throw new Error('invalid input')
    return readDraft(await getDraftsDirectory(), id, platform)
  }))
  ipcMain.handle('drafts:read-title', (event, id: unknown, platform: unknown) => handle(event, async () => {
    if (typeof id !== 'string' || !isPlatform(platform)) throw new Error('invalid input')
    return readPlatformTitle(await getDraftsDirectory(), id, platform)
  }))
  ipcMain.handle('drafts:save-title', (event, id: unknown, platform: unknown, title: unknown, expected: unknown) => handle(event, async () => {
    if (typeof id !== 'string' || !isPlatform(platform) || typeof title !== 'string' || !(expected === null || typeof expected === 'string')) throw new Error('invalid input')
    return savePlatformTitle(await getDraftsDirectory(), id, platform, title, expected)
  }))
  ipcMain.handle('drafts:save', (event, id: unknown, platform: unknown, content: unknown, version: unknown) => handle(event, async () => {
    if (typeof id !== 'string' || !isPlatform(platform) || typeof content !== 'string' || typeof version !== 'string') throw new Error('invalid input')
    return saveDraft(await getDraftsDirectory(), id, platform, content, version)
  }))
  ipcMain.handle('drafts:research', (event, id: unknown, platform: unknown) => handle(event, async () => {
    if (typeof id !== 'string' || (platform !== undefined && !isPlatform(platform))) throw new Error('invalid input')
    const root = await getDraftsDirectory()
    const record = platform === undefined ? await readResearch(root, id) : await readPlatformResearch(root, id, platform)
    if (record?.articleVersion && platform !== undefined) return { ...record, stale: (await readDraft(root, id, platform)).version !== record.articleVersion }
    return record
  }))
  ipcMain.handle('drafts:open-source', (event, id: unknown, url: unknown, platform: unknown) => handle(event, async () => {
    if (typeof id !== 'string' || typeof url !== 'string' || url.length > 4096 || (platform !== undefined && !isPlatform(platform))) throw new Error('invalid input')
    const root = await getDraftsDirectory()
    const record = platform === undefined ? await readResearch(root, id) : await readPlatformResearch(root, id, platform)
    if (!record?.sources.some((source) => source.url === url)) throw new Error('invalid source')
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) throw new Error('invalid url')
    await shell.openExternal(parsed.href)
  }))
  ipcMain.handle('drafts:optimize', (event, value: unknown) => handle(event, async () => {
    if (!value || typeof value !== 'object') throw new Error('invalid input')
    const r = value as Record<string, unknown>
    if (typeof r.id !== 'string' || r.id.length > 200 || !isPlatform(r.platform) || typeof r.version !== 'string' || !/^[a-f0-9]{64}$/.test(r.version) || typeof r.content !== 'string' || r.content.length > 60000 || typeof r.instruction !== 'string' || r.instruction.length > 1000) throw new Error('invalid input')
    return optimizeArticle({ id: r.id, platform: r.platform, version: r.version, content: r.content, instruction: r.instruction })
  }))
  ipcMain.handle('drafts:regenerate', (event, value: unknown) => handle(event, async () => {
    if (!value || typeof value !== 'object') throw new Error('文章操作：生成参数无效。')
    const r = value as Record<string, unknown>
    if (typeof r.id !== 'string' || !r.id || r.id.length > 200 || !isPlatform(r.platform) || typeof r.version !== 'string' || !/^[a-f0-9]{64}$/.test(r.version) || typeof r.title !== 'string' || !r.title.trim() || r.title.length > 500 || /[\r\n\0]/.test(r.title) || !(r.storedTitle === null || (typeof r.storedTitle === 'string' && r.storedTitle.length <= 500))) throw new Error('文章操作：生成参数无效。')
    return regenerateArticle({ id: r.id, platform: r.platform, version: r.version, title: r.title.trim(), storedTitle: r.storedTitle }, () => {})
  }))
  ipcMain.handle('drafts:create-blank', (event, request: unknown) => handle(event, async (): Promise<CreateResult> => {
    if (!validateRequest(request)) throw new Error('invalid input')
    const root = await getDraftsDirectory()
    if (!root) throw new Error('请先在设置中选择草稿目录。')
    await assertAvailableArticleTitle(root, request.title)
    return generateDrafts(root, request, async () => '', undefined, undefined, true)
  }))
  ipcMain.handle('drafts:generate', (event, request: unknown) => handle(event, async (): Promise<CreateResult> => {
    if (!validateRequest(request)) throw new Error('invalid input')
    const root = await getDraftsDirectory()
    if (!root) throw new Error('请先在设置中选择草稿目录。')
    await assertAvailableArticleTitle(root, request.title)
    const progress = (phase: GenerationProgress) => { if (!event.sender.isDestroyed()) event.sender.send('drafts:progress', phase) }
    const result = await createContent(request, progress)
    notifyGeneration({ kind: 'article', count: result.draft?.platforms.length ?? 0, partial: result.failures.length > 0 || Boolean(result.warnings?.length) })
    return result
  }))
}
