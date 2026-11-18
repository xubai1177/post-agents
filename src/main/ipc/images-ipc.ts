import { ipcMain } from 'electron'
import { platforms, type Platform } from '../../shared/drafts'
import type { ImageRequest, ImageGenerationResult } from '../../shared/images'
import { getDraftsDirectory } from '../features/settings/settings'
import { listImages } from '../features/images/image-store'
import { createImages } from '../composition'
import { respond } from './security'

function isPlatform(value: unknown): value is Platform { return typeof value === 'string' && platforms.some((p) => p === value) }
function validRequest(value: unknown): value is ImageRequest {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return typeof data.id === 'string' && isPlatform(data.platform) && typeof data.version === 'string' && /^[a-f0-9]{64}$/.test(data.version) && Number.isInteger(data.count) && typeof data.count === 'number' && data.count >= 2 && data.count <= 8
}
function safeMessage(error: unknown): string {
  if (error instanceof Error && ['请先在设置中选择草稿目录。', '请先配置图片模型及图片服务。', '请先配置文案模型，用于策划配图。', '文案已发生变化，请重新读取并保存后再生成。', '正在为此平台生成图片，请稍候。', '配图方案生成失败，请检查文案模型配置。'].includes(error.message)) return error.message
  return '图片操作失败，请检查模型服务、文件和网络。'
}
function safe<T>(event: Electron.IpcMainInvokeEvent, work: () => Promise<T>) { return respond(event, async () => { try { return await work() } catch (error) { throw new Error(`图片操作：${safeMessage(error)}`) } }) }
export function registerImages(): void {
  ipcMain.handle('images:list', (event, id: unknown, platform: unknown) => safe(event, async () => {
    if (typeof id !== 'string' || !isPlatform(platform)) throw new Error('invalid input')
    return listImages(await getDraftsDirectory(), id, platform)
  }))
  ipcMain.handle('images:generate', (event, request: unknown) => safe(event, async (): Promise<ImageGenerationResult> => {
    if (!validRequest(request)) throw new Error('invalid input')
    return createImages(request)
  }))
}
