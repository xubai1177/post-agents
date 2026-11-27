import { defaultImageStyle, defaultPlatformImageStyles, type PlatformImageStyles } from '../../../shared/image-styles'
import type { ImageRequest, ImageGenerationResult, ImageProgress } from '../../../shared/images'
import { readDraft } from '../drafts/draft-store'
import { generateImages } from './image-generation'
import { requestImage } from '../../infrastructure/image-provider'
import { createTextModel } from '../../infrastructure/text-model'
import { buildImagePrompt } from './image-prompts'
import { coverSizeForStyle } from './cover-size'

const running = new Set<string>()
type ModelConfig = { draftsDirectory: string; apiUrl: string; model: string; apiKey: string; platformImageStyles?: PlatformImageStyles }
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
    const styleId = request.style ?? defaultImageStyle
    const style = (textConfig.platformImageStyles ?? defaultPlatformImageStyles())[request.platform].find(item => item.id === styleId)
    if (!style) throw new Error('所选图片风格已不存在，请重新选择。')
    const visualStyle = style.prompt
    const countInstruction = request.count === undefined ? '根据文章信息量设计 1 张封面及 4 至 6 张正文配图，正文配图不少于 4 张、不多于 6 张，共返回 5 至 7 项。' : `根据文案设计 ${request.count} 张图片，第 1 张是封面，其余是不同内页。`
    let result: string
    try {
      result = await call(`你是多平台配图策划。${countInstruction}指定图片风格要求：${visualStyle} 同组统一风格，正文简洁可读，保持与文案一致；不虚构数据、界面、官方标志或用户体验，示意界面标明示意。仅返回 JSON 字符串数组，每项为一张图的完整中文生图提示词。`,
        `主题：${request.id}\n平台：${request.platform}\n文案：\n${document.content.slice(0, 25000)}`
      )
    } catch { throw new Error('配图方案生成失败：文案模型请求失败，请检查文案模型服务。') }
    try {
      const raw = result.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed) || (request.count === undefined ? parsed.length < 5 || parsed.length > 7 : parsed.length !== request.count) || !parsed.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 5000)) throw new Error('invalid plan')
      prompts = parsed
    } catch { throw new Error('配图方案生成失败：文案模型返回的配图方案格式或数量不符合要求，请重试。') }
    return await deps.generateImages(imageConfig.draftsDirectory, request, prompts, (prompt, index) => deps.requestImage(imageConfig, buildImagePrompt(`${prompt}\n文字与提供的文案一致；不冒充真实截图或官方标识。`, visualStyle), index === 0 ? coverSizeForStyle(imageConfig, visualStyle) : undefined), onProgress)
  } finally { running.delete(lock) }
}
