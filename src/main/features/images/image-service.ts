import type { Platform } from '../../../shared/drafts'
import { defaultImageStyle, type ImageStyle } from '../../../shared/image-styles'
import type { ImageRequest, ImageGenerationResult, ImageProgress } from '../../../shared/images'
import { readDraft } from '../drafts/draft-store'
import { generateImages } from './image-generation'
import { requestImage } from '../../infrastructure/image-provider'
import { createTextModel } from '../../infrastructure/text-model'

const running = new Set<string>()
const styles: Record<Platform, string> = {
  小红书: '封面突出主题和读者问题，内页每张聚焦一个信息点。',
  公众号: '封面围绕主题，正文配图应解释关键内容；画面清晰，适合手机阅读，不设固定画幅。',
  抖音图文: '适合手机竖屏，封面交代主题，内页按内容顺序递进；每张图集中表达一个重点。'
}
const visualStyles: Record<ImageStyle, string> = {
  flat: '清新扁平插画：温暖柔和色彩、清晰轮廓和简洁版式。',
  handdrawn: '手绘插画：自然手绘线条、纸感纹理和亲切的画面。',
  watercolor: '水彩风格：柔和水彩晕染、留白和层次清晰的构图。',
  minimal: '极简信息图：精简元素、清晰的信息层级和留白。'
}
type ModelConfig = { draftsDirectory: string; apiUrl: string; model: string; apiKey: string }
const defaults = { readDraft, createTextModel, generateImages, requestImage }
type ImageDependencies = typeof defaults & { getImageSettings: () => Promise<ModelConfig>; getRuntimeSettings: () => Promise<ModelConfig> }

export async function generateImageSet(request: ImageRequest, deps: ImageDependencies, onProgress?: (progress: ImageProgress) => void): Promise<ImageGenerationResult> {
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
    onProgress?.({ phase: 'planning' })
    const call = deps.createTextModel(textConfig)
    let prompts: string[]
    const visualStyle = visualStyles[request.style ?? defaultImageStyle]
    const countInstruction = request.count === undefined ? '根据文章信息量设计 1 张封面及 4 至 6 张正文配图，正文配图不少于 4 张、不多于 6 张，共返回 5 至 7 项。' : `根据文案设计 ${request.count} 张图片，第 1 张是封面，其余是不同内页。`
    let result: string
    try {
      result = await call(`你是多平台配图策划。${countInstruction}${styles[request.platform]} 指定视觉风格：${visualStyle} 同组统一风格，正文简洁可读，保持与文案一致；不虚构数据、界面、官方标志或用户体验，示意界面标明示意。仅返回 JSON 字符串数组，每项为一张图的完整中文生图提示词。`,
        `主题：${request.id}\n平台：${request.platform}\n文案：\n${document.content.slice(0, 25000)}`
      )
    } catch { throw new Error('配图方案生成失败：文案模型请求失败，请检查文案模型服务。') }
    try {
      const raw = result.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed) || (request.count === undefined ? parsed.length < 5 || parsed.length > 7 : parsed.length !== request.count) || !parsed.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 5000)) throw new Error('invalid plan')
      prompts = parsed
    } catch { throw new Error('配图方案生成失败：文案模型返回的配图方案格式或数量不符合要求，请重试。') }
    return await deps.generateImages(imageConfig.draftsDirectory, request, prompts, (prompt) => deps.requestImage(imageConfig, `${prompt}\n指定视觉风格：${visualStyle}\n仅作插画示意，不冒充真实截图或官方标识；文字与提供的文案一致。`), onProgress)
  } finally { running.delete(lock) }
}
