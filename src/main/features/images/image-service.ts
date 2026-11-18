import type { Platform } from '../../../shared/drafts'
import type { ImageRequest, ImageGenerationResult } from '../../../shared/images'
import { readDraft } from '../drafts/draft-store'
import { generateImages } from './image-generation'
import { requestImage } from '../../infrastructure/image-provider'
import { createTextModel } from '../../infrastructure/text-model'

const running = new Set<string>()
const styles: Record<Platform, string> = {
  小红书: '封面突出主题和读者问题，内页每张聚焦一个信息点；实用教程可使用温暖米白、深蓝和橙红的清新扁平插画，其它题材按内容选合适风格。',
  公众号: '封面围绕主题，正文配图应解释关键内容；画面清晰，适合手机阅读，不设固定画幅。',
  抖音图文: '适合手机竖屏，封面交代主题，内页按内容顺序递进；每张图集中表达一个重点。'
}
type ModelConfig = { draftsDirectory: string; apiUrl: string; model: string; apiKey: string }
const defaults = { readDraft, createTextModel, generateImages, requestImage }
type ImageDependencies = typeof defaults & { getImageSettings: () => Promise<ModelConfig>; getRuntimeSettings: () => Promise<ModelConfig> }

export async function generateImageSet(request: ImageRequest, deps: ImageDependencies): Promise<ImageGenerationResult> {
  const imageConfig = await deps.getImageSettings()
  if (!imageConfig.draftsDirectory) throw new Error('请先在设置中选择草稿目录。')
  if (!imageConfig.apiUrl || !imageConfig.apiKey || !imageConfig.model) throw new Error('请先配置图片模型及图片服务。')
  const textConfig = await deps.getRuntimeSettings()
  if (!textConfig.apiUrl || !textConfig.model || !textConfig.apiKey) throw new Error('请先配置文案模型，用于策划配图。')
  const lock = JSON.stringify([imageConfig.draftsDirectory, request.id, request.platform])
  if (running.has(lock)) throw new Error('正在为此平台生成图片，请稍候。')
  running.add(lock)
  try {
    const document = await deps.readDraft(imageConfig.draftsDirectory, request.id, request.platform)
    if (document.version !== request.version) throw new Error('文案已发生变化，请重新读取并保存后再生成。')
    const call = deps.createTextModel(textConfig)
    let prompts: string[]
    try {
      const result = await call(`你是多平台配图策划。根据文案设计 ${request.count} 张图片，第 1 张是封面，其余是不同内页。${styles[request.platform]} 同组统一风格，正文简洁可读，保持与文案一致；不虚构数据、界面、官方标志或用户体验，示意界面标明示意。仅返回 JSON 字符串数组，每项为一张图的完整中文生图提示词。`,
        `主题：${request.id}\n平台：${request.platform}\n文案：\n${document.content.slice(0, 25000)}`
      )
      const raw = result.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed) || parsed.length !== request.count || !parsed.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 5000)) throw new Error('invalid plan')
      prompts = parsed
    } catch { throw new Error('配图方案生成失败，请检查文案模型配置。') }
    return await deps.generateImages(imageConfig.draftsDirectory, request, prompts, (prompt) => deps.requestImage(imageConfig, `${prompt}\n仅作插画示意，不冒充真实截图或官方标识；文字与提供的文案一致。`))
  } finally { running.delete(lock) }
}
