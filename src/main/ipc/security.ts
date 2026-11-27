import { app, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ResearchUnavailableError } from '../errors'
import { isTrustedRendererUrl } from './trusted-url'
import type { Result } from '../../shared/settings'

function trusted(event: IpcMainInvokeEvent): boolean {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || event.senderFrame !== event.sender.mainFrame) return false
  const url = event.senderFrame.url
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    return isTrustedRendererUrl(url, process.env.ELECTRON_RENDERER_URL, true)
  }
  return isTrustedRendererUrl(url, pathToFileURL(join(__dirname, '../renderer/index.html')).href, false)
}
export function respond<T>(event: IpcMainInvokeEvent, action: () => Promise<T>): Promise<Result<T>> {
  if (!trusted(event)) return Promise.resolve({ ok: false, error: '无法验证请求来源。' })
  return action().then((value) => ({ ok: true as const, value })).catch((error: unknown) => error instanceof ResearchUnavailableError ? { ok: false as const, code: 'RESEARCH_UNAVAILABLE' as const, error: `草稿操作：${error.message}` } : ({ ok: false as const, error: error instanceof Error && (error.message.startsWith('模型列表：') || error.message.startsWith('无法读取') || error.message.startsWith('此设备的安全存储') || (error.message.startsWith('草稿操作：') || error.message.startsWith('文章操作：') || error.message.startsWith('工作空间操作：') || error.message.startsWith('工作区操作：')) || error.message.startsWith('白板视频：') || error.message.startsWith('发现操作：') || error.message.startsWith('图片操作：') || error.message.startsWith('图片风格测试：') || error.message.startsWith('图片风格预览：') || error.message.startsWith('选题生成失败') || error.message.startsWith('选题操作：')) ? error.message : '操作失败，请检查权限或稍后重试。' }))
}
