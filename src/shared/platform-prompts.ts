import { platforms, type Platform } from './drafts'

export type PlatformPrompts = Partial<Record<Platform, string>>
export const defaultPlatformPrompts: Record<Platform, string> = {
  "小红书": "围绕主题和目标读者，写一篇适合小红书阅读的实用笔记。标题具体、真实，突出读者关心的问题或收获，不夸大效果、不制造焦虑。开头尽快回应主题，让读者知道文章能解决什么问题。\n\n根据内容需要安排简短清晰的小标题和段落，优先讲清读者需要知道的结论、条件和做法；涉及操作步骤时，按实际顺序说明。语言自然、有亲和力，但不强制使用特定称呼、网络热词或固定人设。可根据内容少量使用表情和标签，不为凑格式而添加。\n\n保留影响读者判断的重要条件和例外。对确实不确定的事项，用简洁、具体的语言说明需要向谁确认什么。避免大段堆砌、空泛口号和与主题无关的信息。",
  "公众号": "围绕主题和目标读者，写一篇结构完整、适合公众号阅读的文章。标题准确具体，体现文章的核心问题或价值，不夸大、不制造焦虑。开头交代读者关心的问题，以及为什么值得了解。\n\n根据主题组织清晰的小标题，充分解释必要的背景、原因、影响和适用条件；涉及选择或操作时，讲清不同情况、具体路径和必要的取舍。内容详略由主题决定，不为追求篇幅重复扩写。\n\n语言自然、清楚，有信息量，避免公文腔和套话。结尾归纳读者可以采取的下一步；存在关键不确定性时，说明需要进一步确认的事项。",
  "抖音图文": "围绕一个明确的读者问题，写一篇适合抖音图文阅读的文案。标题直接、具体，能够体现主题或收获，不夸大效果、不制造焦虑。开头快速点明问题和关键结论。\n\n使用简洁的句子和清晰的段落，每段集中表达一个重点。根据主题选择合适的顺序，讲清关键判断、原因、做法和必要的注意事项；需要分步骤时，按读者实际操作顺序展开。\n\n保持表达自然、有节奏，避免碎片化口号和机械罗列。即使不看配图，读者也应能理解重要条件和例外；标签仅在适合内容时使用。"
}
export function isPlatformPrompts(value: unknown): value is PlatformPrompts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([key, prompt]) => platforms.some((platform) => platform === key) && typeof prompt === 'string' && prompt.length <= 4000 && !prompt.includes('\0'))
}
export function resolvePlatformPrompts(value?: PlatformPrompts): Record<Platform, string> {
  return { 小红书: value?.小红书?.trim() || defaultPlatformPrompts.小红书, 公众号: value?.公众号?.trim() || defaultPlatformPrompts.公众号, 抖音图文: value?.抖音图文?.trim() || defaultPlatformPrompts.抖音图文 }
}

export function compactPlatformPrompts(value: PlatformPrompts): PlatformPrompts {
  const result: PlatformPrompts = {}
  for (const platform of platforms) {
    const prompt = value[platform]?.trim()
    if (prompt && prompt !== defaultPlatformPrompts[platform]) result[platform] = prompt
  }
  return result
}

export const defaultTitlePrompts: Record<Platform, string> = {
  小红书: '标题具体、有吸引力，突出读者关心的问题或收获，表达自然，不夸大。',
  公众号: '标题准确、清晰，体现文章的核心问题或价值，不夸大。',
  抖音图文: '标题直接、简洁，突出问题或收获，适合抖音图文，不夸大。',
}
export function resolveTitlePrompts(value?: PlatformPrompts): Record<Platform, string> {
  return { 小红书: value?.小红书?.trim() || defaultTitlePrompts.小红书, 公众号: value?.公众号?.trim() || defaultTitlePrompts.公众号, 抖音图文: value?.抖音图文?.trim() || defaultTitlePrompts.抖音图文 }
}
