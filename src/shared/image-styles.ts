import type { Platform } from './drafts'

export const imageStyles = ['flat', 'handdrawn', 'watercolor', 'minimal', 'magazine'] as const
export type ImageStyle = string
export interface ImageStyleDefinition { id: string; name: string; prompt: string; preview?: string }
export type PlatformImageStyles = Record<Platform, ImageStyleDefinition[]>
export const imageStyleLabels: Record<string, string> = { flat: '清新扁平', handdrawn: '手绘插画', watercolor: '水彩', minimal: '极简信息图', magazine: '黑白杂志' }
export const defaultImageStyle: ImageStyle = 'flat'
export const imageStyleDefaultsVersion = 2 as const
const legacyImageStyleDefinitions: ImageStyleDefinition[] = [
  { id: 'flat', name: '清新扁平', prompt: '清新扁平插画：温暖柔和色彩、清晰轮廓和简洁版式。' },
  { id: 'handdrawn', name: '手绘插画', prompt: '手绘插画：自然手绘线条、纸感纹理和亲切的画面。' },
  { id: 'watercolor', name: '水彩', prompt: '水彩风格：柔和水彩晕染、留白和层次清晰的构图。' },
  { id: 'minimal', name: '极简信息图', prompt: '极简信息图：精简元素、清晰的信息层级和留白。' },
  { id: 'magazine', name: '黑白杂志', prompt: '黑白杂志：暖白纸面、黑色粗体标题、浅灰几何元素、细分隔线与充足留白，采用清晰的杂志式文字排版。封面突出精炼主题，正文每张聚焦一个要点，控制文字量；同组保持字体层级和配色统一，避免拥挤、装饰插画及无意义文字。' }
]
export function isImageStyle(value: unknown): value is ImageStyle { return typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value) }
const visualPrompts: Record<string, string> = {
  flat: '清新扁平插画：使用温暖柔和的配色、简洁形状和清晰轮廓，画面轻盈、亲切，主体与背景层次分明。',
  handdrawn: '手绘插画：使用自然的手绘线条、适度的纸张肌理和柔和手工上色，画面真实亲切，线条和细节保持清晰。',
  watercolor: '水彩插画：使用柔和透明的水彩晕染与纸张肌理，色彩克制、留白舒适，主体边缘和文字区域保持清楚。',
  minimal: '极简信息图：使用少量形状、图标或简洁图表组织信息，对齐整齐、层级明确，避免堆砌图标、数据和装饰。',
  magazine: '黑白杂志：以暖白、黑色和浅灰为主，使用有层次的字体、细分隔线和适度几何元素，保持克制的编辑式排版与留白。'
}
const previousPlatformComposition: Record<Platform, string> = {
  小红书: '封面围绕文章主题突出一个易读的重点，正文图每张聚焦一个要点；整体适合手机浏览，同组画面保持一致，文字精简并避免拥挤。',
  公众号: '封面围绕文章主题建立清晰视觉重点；正文配图结合相应段落说明内容，避免与正文重复堆字，同组配色与视觉语言保持一致。',
  抖音图文: '封面突出主题，正文图按文章顺序逐步展开，每张聚焦一个要点；画面适合手机浏览，文字简短清晰，同组视觉保持一致。'
}
const coverRatios: Record<Platform, string> = { 小红书: '3:4', 公众号: '2.35:1', 抖音图文: '3:4' }
export function defaultPlatformImageStyles(): PlatformImageStyles {
  const forPlatform = (platform: Platform) => legacyImageStyleDefinitions.map(item => ({ id: item.id, name: item.name, prompt: `${visualPrompts[item.id]}${previousPlatformComposition[platform]}封面画幅比例：${coverRatios[platform]}。` }))
  return { 小红书: forPlatform('小红书'), 公众号: forPlatform('公众号'), 抖音图文: forPlatform('抖音图文') }
}

// Only replace unchanged legacy defaults. Preserve user edits, custom styles and previews.
export function upgradeLegacyPlatformImageStyles(styles: PlatformImageStyles): PlatformImageStyles {
  const defaults = defaultPlatformImageStyles()
  const upgrade = (platform: Platform) => styles[platform].map(item => {
    const old = legacyImageStyleDefinitions.find(entry => entry.id === item.id)
    const updated = defaults[platform].find(entry => entry.id === item.id)
    const previousPrompt = old ? `${visualPrompts[old.id]}${previousPlatformComposition[platform]}` : undefined
    return old && updated && (item.prompt === old.prompt || item.prompt === previousPrompt) ? { ...item, prompt: updated.prompt } : { ...item }
  })
  return { 小红书: upgrade('小红书'), 公众号: upgrade('公众号'), 抖音图文: upgrade('抖音图文') }
}
export function isPlatformImageStyles(value: unknown): value is PlatformImageStyles {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const data = value as Record<string, unknown>
  if (Object.keys(data).some(key => !['小红书', '公众号', '抖音图文'].includes(key))) return false
  let previewBytes = 0
  return ['小红书', '公众号', '抖音图文'].every(platform => {
    const entries = data[platform]
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 30) return false
    const ids = new Set<string>()
    return entries.every(entry => {
      if (!entry || typeof entry !== 'object') return false
      const item = entry as Record<string, unknown>
      if (!isImageStyle(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 50 || typeof item.prompt !== 'string' || !item.prompt.trim() || item.prompt.length > 4000) return false
      if (item.preview !== undefined && (typeof item.preview !== 'string' || item.preview.length > 400000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(item.preview))) return false
      previewBytes += typeof item.preview === 'string' ? item.preview.length : 0
      ids.add(item.id); return previewBytes <= 6 * 1024 * 1024
    })
  })
}
export function imageStylePreview(style: ImageStyleDefinition): string | undefined {
  if (style.preview) return style.preview
  if (!imageStyles.some(id => id === style.id)) return undefined
  const defaultWideCover = /封面画幅比例\s*[：:]\s*2\.35\s*[:：]\s*1(?![\d.])/.test(style.prompt)
  return `./image-style-previews/${defaultWideCover ? 'wechat/' : ''}${style.id}.webp`
}
export type PlatformStyleSelections = Partial<Record<Platform, ImageStyle>>
export function isPlatformStyleSelections(value: unknown): value is PlatformStyleSelections {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([platform, style]) => ['小红书', '公众号', '抖音图文'].includes(platform) && isImageStyle(style))
}

export function replacePlatformStylePreview(styles: PlatformImageStyles, platform: Platform, style: ImageStyleDefinition): PlatformImageStyles {
  if (!['小红书', '公众号', '抖音图文'].includes(platform) || !style.preview) throw new Error('图片风格预览无效。')
  const current = styles[platform]
  const found = current.some(item => item.id === style.id)
  const updated = found
    ? current.map(item => item.id === style.id ? { ...item, preview: style.preview } : item)
    : [...current, { ...style }]
  const next = { ...styles, [platform]: updated }
  if (!isPlatformImageStyles(next)) throw new Error('图片风格预览无效或配置过大，请检查风格名称、提示词和预览图。')
  return next
}
