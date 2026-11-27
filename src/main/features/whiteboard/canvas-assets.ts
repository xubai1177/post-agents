import { nativeImage } from 'electron'
import { getImageSettings } from '../settings/settings'
import { requestImageWithUsage } from '../../infrastructure/image-provider'
import { removeWhiteBorder } from './sticker-background'
import type { CanvasAsset, CanvasImageUsage } from '../../../shared/whiteboard'
import { canvasImageUsage, isSafeCanvasImage } from './canvas-validation'

export function decodeCanvasAsset(bytes: Buffer, name: string, removeBackground = false): CanvasAsset {
  if (!isSafeCanvasImage(bytes)) throw new Error('白板视频：图片格式无效或超过 15 MB，请选择 PNG、JPG 或 WebP。')
  const image = nativeImage.createFromBuffer(bytes)
  const { width, height } = image.getSize()
  if (image.isEmpty() || width > 4096 || height > 4096 || width * height > 16000000) throw new Error('白板视频：图片格式或尺寸无效。')
  const original = image.toPNG()
  const bitmap = removeBackground ? removeWhiteBorder(image.toBitmap(), width, height) : null
  const processed = bitmap ? nativeImage.createFromBitmap(bitmap, { width, height }).toPNG() : original
  return { name: name.slice(0, 100), original: `data:image/png;base64,${original.toString('base64')}`, image: `data:image/png;base64,${processed.toString('base64')}`, width, height, backgroundRemoved: !!bitmap }
}
export async function generateCanvasAsset(description: string, purpose: 'sticker' | 'background' = 'sticker', ratio: 'landscape' | 'vertical' = 'landscape'): Promise<{ asset: CanvasAsset; model: string; usage: CanvasImageUsage }> {
  if (!description.trim() || description.length > 300 || /[\u0000-\u0008]/.test(description)) throw new Error('白板视频：请输入不超过 300 字的素材描述。')
  const config = await getImageSettings()
  if (!config.apiKey || !config.apiUrl || !config.model) throw new Error('白板视频：请先在设置中配置图片模型。')
  const prompt = purpose === 'background' ? `白板动画背景：${description.trim()}。${ratio === 'vertical' ? '竖屏 9:16' : '横屏 16:9'}构图，浅色低对比度，为前景文字和插画留出充足空间，不要文字、边框或水印。` : `白板动画贴纸：${description.trim()}。手绘黑色线条，少量柔和色彩，单个主体，纯白背景，不要文字、边框或水印。`
  const result = await requestImageWithUsage(config, prompt)
  return { asset: decodeCanvasAsset(result.bytes, description.trim(), purpose === 'sticker'), model: config.model, usage: canvasImageUsage(result.usage) }
}
