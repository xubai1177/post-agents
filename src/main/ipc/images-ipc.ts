import { app, BrowserWindow, dialog, ipcMain, shell, type WebContents } from 'electron'
import { platforms, type Platform } from '../../shared/drafts'
import { isImageStyle, isPlatformStyleSelections } from '../../shared/image-styles'
import type { ArticleImagesRequest, ImageDownloadRequest, ImageRequest, ImageGenerationResult } from '../../shared/images'
import { getDraftsDirectory } from '../features/settings/settings'
import { downloadImageToDirectory, downloadImages, isImageFilename, listImages, removeImage } from '../features/images/image-store'
import { createArticleImages, createImages, enqueueImageJob, listImageJobs, onImageJobsChanged } from '../composition'
import { respond } from './security'
import { notifyGeneration } from '../infrastructure/notifications'

function isPlatform(value: unknown): value is Platform { return typeof value === 'string' && platforms.some((p) => p === value) }
function validDownload(value: unknown): value is ImageDownloadRequest {
  if (!value || typeof value !== 'object') return false
  const { id, platform, kind, name } = value as Record<string, unknown>
  return typeof id === 'string' && id.length > 0 && id.length <= 255 &&
    id !== '.' && id !== '..' && !/[\\/\0]/.test(id) && isPlatform(platform) &&
    (kind === 'all' || (kind === 'single' && isImageFilename(name)))
}
function validRequest(value: unknown): value is ImageRequest {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return typeof data.id === 'string' && isPlatform(data.platform) && typeof data.version === 'string' && /^[a-f0-9]{64}$/.test(data.version) && (data.count === undefined || (typeof data.count === 'number' && Number.isInteger(data.count) && data.count >= 2 && data.count <= 8)) && (data.style === undefined || isImageStyle(data.style))
}
function validArticleRequest(value: unknown): value is ArticleImagesRequest {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return typeof data.id === 'string' && data.id.length > 0 && data.id.length <= 200 && typeof data.runId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(data.runId) && isImageStyle(data.style) && (data.imageStylesByPlatform === undefined || isPlatformStyleSelections(data.imageStylesByPlatform)) && Array.isArray(data.platforms) && data.platforms.length > 0 && data.platforms.length <= platforms.length && data.platforms.every(isPlatform) && new Set(data.platforms).size === data.platforms.length
}
function safeMessage(error: unknown): string {
  if (error instanceof Error && ['请先在设置中选择草稿目录。', '请先配置图片模型及图片服务。', '请先配置文案模型，用于策划配图。', '文案已发生变化，请重新读取并保存后再生成。', '正在为此平台生成图片，请稍候。', '所选图片风格已不存在，请重新选择。', '配图方案生成失败：文案模型请求失败，请检查文案模型服务。', '配图方案生成失败：文案模型返回的配图方案格式或数量不符合要求，请重试。'].includes(error.message)) return error.message
  return '图片操作失败，请检查模型服务、文件和网络。'
}
function safe<T>(event: Electron.IpcMainInvokeEvent, work: () => Promise<T>) { return respond(event, async () => { try { return await work() } catch (error) { throw new Error(`图片操作：${safeMessage(error)}`) } }) }
const imageListeners = new Set<WebContents>()
function trackImages(sender: WebContents): void {
  if (imageListeners.has(sender)) return
  imageListeners.add(sender)
  sender.once('destroyed', () => imageListeners.delete(sender))
}
export function registerImages(): void {
  onImageJobsChanged(() => { for (const sender of imageListeners) { if (!sender.isDestroyed()) sender.send('images:jobs-changed') } })
  ipcMain.handle('images:jobs', (event) => safe(event, async () => { trackImages(event.sender); return listImageJobs(await getDraftsDirectory()) }))
  ipcMain.handle('images:enqueue', (event, request: unknown) => safe(event, async () => {
    if (!validRequest(request)) throw new Error('invalid input')
    trackImages(event.sender)
    await enqueueImageJob(request)
  }))
  ipcMain.handle('images:list', (event, id: unknown, platform: unknown) => safe(event, async () => {
    if (typeof id !== 'string' || !isPlatform(platform)) throw new Error('invalid input')
    return listImages(await getDraftsDirectory(), id, platform)
  }))
  ipcMain.handle('images:remove', (event, id: unknown, platform: unknown, name: unknown) => respond(event, async () => {
    if (typeof id !== 'string' || !isPlatform(platform) || !isImageFilename(name)) throw new Error('图片操作：删除参数无效。')
    const root = await getDraftsDirectory()
    if (!root) throw new Error('图片操作：请先打开工作空间。')
    try { await removeImage(root, id, platform, name, path => shell.trashItem(path)) }
    catch (error) { throw new Error(error instanceof Error && error.message === '找不到这张配图，请重新打开文章。' ? `图片操作：${error.message}` : '图片操作：删除失败，请检查图片和工作空间。') }
  }))
  ipcMain.handle('images:download', (event, request: unknown) => respond(event, async () => {
    if (!validDownload(request)) throw new Error('图片操作：下载参数无效。')
    const window = BrowserWindow.fromWebContents(event.sender)
    const root = await getDraftsDirectory()
    if (!window || !root) throw new Error('图片操作：请先打开工作空间。')
    const { id, platform } = request
    try {
      const result = await dialog.showOpenDialog(window, {
        title: request.kind === 'single' ? '选择图片的保存位置' : '选择全部配图的保存位置',
        defaultPath: app.getPath('downloads'),
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || !result.filePaths[0]) return null
      return request.kind === 'single'
        ? await downloadImageToDirectory(root, id, platform, request.name, result.filePaths[0])
        : await downloadImages(root, id, platform, result.filePaths[0])
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error('图片操作：同名文件已存在，请换个名称或位置。')
      }
      if (error instanceof Error && ['找不到这张配图，请重新打开文章。', '当前平台没有可下载的配图。', '配图文件夹重名过多，请选择其他位置。', '图片文件重名过多，请选择其他位置。'].includes(error.message)) {
        throw new Error(`图片操作：${error.message}`)
      }
      throw new Error('图片操作：下载失败，请检查源图片和保存位置。')
    }
  }))
  ipcMain.handle('images:generate-for-article', (event, request: unknown) => safe(event, async () => {
    if (!validArticleRequest(request)) throw new Error('invalid input')
    return createArticleImages(request, (message) => { if (!event.sender.isDestroyed()) event.sender.send('images:article-progress', { runId: request.runId, message }) })
  }))
  ipcMain.handle('images:generate', (event, request: unknown) => safe(event, async (): Promise<ImageGenerationResult> => {
    if (!validRequest(request)) throw new Error('invalid input')
    const result = await createImages(request)
    notifyGeneration({ kind: 'images', count: result.images.length, partial: result.failures.length > 0 })
    return result
  }))
}
