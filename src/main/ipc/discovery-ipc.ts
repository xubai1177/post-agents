import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { respond } from './security'
import { account, detail, image, login, logout, openOriginal, search, selectedDetail } from '../features/discovery/browser'
import { rewriteDiscovery } from '../features/discovery/rewrite'
import { getDraftsDirectory, getImageSettings, getRuntimeSettings } from '../features/settings/settings'
import { createImageDescriptionModel, createTextModel } from '../infrastructure/text-model'
import { requestImage } from '../infrastructure/image-provider'
import { generateReferenceImage, referenceImageForSave, clearReferenceImage, rewriteImage, standaloneImage, downloadStandaloneImage } from '../features/discovery/reference-image'
import { saveImage } from '../features/images/image-store'
import { generateDrafts } from '../features/content/generation'
import { readDraft, saveDraft } from '../features/drafts/draft-store'
import { savePlatformResearch } from '../features/research/research'
import { assertAvailableArticleTitle } from '../features/workspace/workspace-index'
import { exportOriginalPost } from '../features/discovery/export-bundle'

function id(value: unknown): string { if (typeof value !== 'string' || !/^[a-zA-Z0-9]{8,40}$/.test(value)) throw new Error('发现操作：帖子参数无效。'); return value }
export function registerDiscovery(): void {
  ipcMain.handle('discovery:account', event => respond(event, account))
  ipcMain.handle('discovery:image', (event, value: unknown, index: unknown) => respond(event, () => { if (!Number.isInteger(index) || typeof index !== 'number' || index < -1 || index > 19) throw new Error('发现操作：图片参数无效。'); return image(id(value), index) }))
  ipcMain.handle('discovery:login', event => respond(event, login))
  ipcMain.handle('discovery:logout', event => respond(event, logout))
  ipcMain.handle('discovery:search', (event, value: unknown) => respond(event, async () => { if (typeof value !== 'string' || !value.trim() || value.length > 100 || /[\u0000-\u001f]/.test(value)) throw new Error('发现操作：请输入不超过 100 字的主题。'); return search(value.trim()) }))
  ipcMain.handle('discovery:detail', (event, value: unknown) => respond(event, () => detail(id(value))))
  ipcMain.handle('discovery:export-original', (event, value: unknown) => respond(event, async () => {
    const post = selectedDetail(id(value)), window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('发现操作：无法打开保存窗口。')
    const root = await getDraftsDirectory()
    if (!root) throw new Error('发现操作：请先在设置中选择创作目录。')
    const result = await dialog.showOpenDialog(window, { title: '选择帖子保存位置', defaultPath: root, properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    try { return await exportOriginalPost(result.filePaths[0], post, image) }
    catch (error) { if (error instanceof Error && error.message.startsWith('发现操作：')) throw error; throw new Error('发现操作：保存失败，请检查保存位置后重试。') }
  }))
  ipcMain.handle('discovery:open-original', (event, value: unknown) => respond(event, () => openOriginal(id(value))))
  ipcMain.handle('discovery:rewrite', (event, value: unknown) => respond(event, async () => {
    const selected = selectedDetail(id(value)), config = await getRuntimeSettings()
    if (!config.apiUrl || !config.apiKey || !config.model) throw new Error('发现操作：请先在设置中配置文案模型服务。')
    return rewriteDiscovery(selected, createTextModel(config))
  }))
  ipcMain.handle('discovery:rewrite-image', (event, value: unknown, index: unknown) => respond(event, async () => {
    const postId = id(value), selected = selectedDetail(postId)
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= selected.imageCount) throw new Error('发现操作：请选择有效的帖子图片。')
    const [textConfig, imageConfig] = await Promise.all([getRuntimeSettings(), getImageSettings()])
    if (!textConfig.apiUrl || !textConfig.apiKey || !textConfig.model || !imageConfig.apiUrl || !imageConfig.apiKey || !imageConfig.model) throw new Error('发现操作：请先配置文案模型和图片模型服务。')
    return rewriteImage({ id: postId, index }, { readImage: image, describe: createImageDescriptionModel(textConfig), generate: prompt => requestImage(imageConfig, prompt) })
  }))
  ipcMain.handle('discovery:download-rewritten-image', (event, value: unknown, token: unknown) => respond(event, async () => {
    const postId = id(value)
    if (typeof token !== 'string' || !/^[a-f0-9-]{36}$/.test(token)) throw new Error('发现操作：图片候选无效，请重新生成。')
    standaloneImage(token, postId)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('发现操作：无法打开保存窗口。')
    const result = await dialog.showOpenDialog(window, { title: '选择图片保存位置', defaultPath: app.getPath('downloads'), properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    try { return await downloadStandaloneImage(result.filePaths[0], token, postId) }
    catch { throw new Error('发现操作：保存图片失败，请检查保存位置后重试。') }
  }))
  ipcMain.handle('discovery:generate-image', (event, input: unknown) => respond(event, async () => {
    if (!input || typeof input !== 'object') throw new Error('发现操作：图片参数无效。')
    const value = input as Record<string, unknown>, postId = id(value.id)
    const selected = selectedDetail(postId)
    if (typeof value.index !== 'number' || !Number.isInteger(value.index) || value.index < 0 || value.index >= selected.imageCount || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100 || typeof value.content !== 'string' || !value.content.trim() || value.content.length > 60000) throw new Error('发现操作：请选择图片并填写有效的文章标题和正文。')
    const [textConfig, imageConfig] = await Promise.all([getRuntimeSettings(), getImageSettings()])
    if (!textConfig.apiUrl || !textConfig.apiKey || !textConfig.model || !imageConfig.apiUrl || !imageConfig.apiKey || !imageConfig.model) throw new Error('发现操作：请先配置文案模型和图片模型服务。')
    return generateReferenceImage({ id: postId, index: value.index, title: value.title.trim(), content: value.content }, { readImage: image, describe: createImageDescriptionModel(textConfig), generate: prompt => requestImage(imageConfig, prompt) })
  }))
  ipcMain.handle('discovery:save', (event, input: unknown) => respond(event, async () => {
    if (!input || typeof input !== 'object') throw new Error('发现操作：保存参数无效。')
    const value = input as Record<string, unknown>, selected = selectedDetail(id(value.id))
    if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100 || typeof value.content !== 'string' || !value.content.trim() || value.content.length > 60000) throw new Error('发现操作：请填写有效的文章标题和候选正文。')
    if (value.imageToken !== undefined && (typeof value.imageToken !== 'string' || !/^[a-f0-9-]{36}$/.test(value.imageToken))) throw new Error('发现操作：图片候选无效，请重新生成。')
    const imageBytes = typeof value.imageToken === 'string' ? referenceImageForSave(value.imageToken, { id: selected.id, title: value.title.trim(), content: value.content }) : null
    const root = await getDraftsDirectory(); if (!root) throw new Error('发现操作：请先选择工作空间。')
    await assertAvailableArticleTitle(root, value.title)
    const result = await generateDrafts(root, { title: value.title.trim(), audience: '', platforms: ['小红书'], research: 'skip' }, async () => '', undefined, undefined, true)
    if (!result.draft) throw new Error('发现操作：创建文章失败。')
    const draft = result.draft
    try {
      const original = await readDraft(root, draft.id, '小红书')
      const saved = await saveDraft(root, draft.id, '小红书', value.content, original.version)
      const warnings: string[] = []
      if (imageBytes) {
        try { await saveImage(root, draft.id, '小红书', 0, imageBytes); if (typeof value.imageToken === 'string') clearReferenceImage(value.imageToken) }
        catch { warnings.push('配图保存失败，请在文章中重新生成。') }
      }
      try { await savePlatformResearch(root, draft.id, '小红书', { version: 1, status: 'sources_found', checkedAt: new Date().toISOString(), sources: [{ title: selected.title, url: selected.sourceUrl, retrievedAt: new Date().toISOString(), fetched: true }], pending: ['请核查参考帖子的事实和时效。'], warnings: [], articleVersion: saved.version }) }
      catch { warnings.push('来源记录保存失败，请手动保留原文链接。') }
      if (warnings.length) return { draft, warning: `文章和文案已保存。${warnings.join('')}` }
    } catch { return { draft, warning: '文章已创建，但文案保存失败，请检查文章并重试。' } }
    return { draft }
  }))
}
