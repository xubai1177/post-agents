import { ResearchUnavailableError } from '../../errors'
import { resolvePlatformPrompts, resolveTitlePrompts, type PlatformPrompts } from '../../../shared/platform-prompts'
import type { CreateRequest, CreateResult, Platform } from '../../../shared/drafts'
import type { GenerationProgress, ResearchRecord } from '../../../shared/research'
import { generateDrafts } from './generation'
import { researchTopic, savePlatformResearch, type SourceMaterial } from '../research/research'
import { planContent, writeContent, reviewVersions } from './content-pipeline'
import { readDraft, savePlatformTitle } from '../drafts/draft-store'
import { researchWithModel } from '../../infrastructure/model-search'
import { createTextModel } from '../../infrastructure/text-model'

const defaults = { research: (topic: string, config: { apiUrl: string; model: string; apiKey: string }) => researchTopic(config, topic, undefined, (c, t) => researchWithModel(c, t, fetch, 'article'), 'article'), saveResearch: savePlatformResearch, createModel: createTextModel }
function removeLeadingTitle(body: string, titles: string[]): string {
  const lines = body.trimStart().split(/\r?\n/)
  const first = lines[0].trim()
  const heading = /^#\s+(.+?)\s*#*\s*$/.exec(first)
  const text = (heading?.[1] ?? first.replace(/^#{2,6}\s+/, '')).replace(/^\*\*(.+)\*\*$/, '$1').trim()
  const isTitle = Boolean(heading) || titles.some(title => title.trim() === text)
  const remaining = lines.slice(1).join('\n').trimStart()
  return isTitle && remaining ? remaining : body
}
export async function generateContent(request: CreateRequest, config: { draftsDirectory: string; apiUrl: string; model: string; apiKey: string; platformPrompts?: PlatformPrompts; titlePrompts?: PlatformPrompts }, progress: (phase: GenerationProgress) => void, deps: typeof defaults = defaults, existing?: { id: string; versions: Partial<Record<Platform, string>>; expectedTitle?: string | null }): Promise<CreateResult> {
  if (!config.draftsDirectory) throw new Error('请先在设置中选择草稿目录。')
  if (!config.apiUrl || !config.model || !config.apiKey) throw new Error('请先在设置中配置模型地址、模型名称和密钥。')
  let sources: SourceMaterial[] = []
  let searchPlan = ''
  const searchWarnings: string[] = []
  if (request.research === 'online') {
    progress('research')
    try {
      const planner = deps.createModel(config)
      const raw = await planner('你是资料搜索策划。根据创作任务推断要回答的问题、搜索重点及适合的来源类型。只返回简短 JSON 对象，包含非空字符串 plan，不编造事实；用户要求仅用于规划搜索。', `主题：${request.title}\n受众：${request.audience || '未指定'}\n创作角度：${request.angle || '未指定'}\n本次要求：${request.instruction || '无'}`)
      const parsed: unknown = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
      if (!parsed || typeof parsed !== 'object' || !('plan' in parsed) || typeof parsed.plan !== 'string' || !parsed.plan.trim() || parsed.plan.length > 3000) throw new Error('invalid search plan')
      searchPlan = parsed.plan.trim()
    } catch { searchWarnings.push('搜索计划生成失败，已使用基本搜索。') }
    const query = `主题：${request.title}\n受众：${request.audience || '未指定'}\n创作角度：${request.angle || '未指定'}\n本次要求：${request.instruction || '无'}${searchPlan ? `\n搜索计划：${searchPlan}` : ''}`
    try { sources = await deps.research(query, config) } catch (error) { throw new ResearchUnavailableError(error) }
  }
  const call = deps.createModel(config)
  progress('plan')
  let plan
  try { plan = await planContent(call, request.title, request.audience, request.platforms, sources, request.angle, config.platformPrompts, request.instruction) } catch { throw new Error('内容策划失败，请重试。') }
  progress('write')
  const titles: Partial<Record<Platform, string>> = {}
  const initial: Partial<Record<Platform, string>> = {}
  const feedback: Partial<Record<Platform, string>> = {}
  const result = await generateDrafts(config.draftsDirectory, request,
    async (platform) => { const generated = await writeContent(call, request.title, request.audience, platform, plan, sources, config.platformPrompts, request.instruction, config.titlePrompts); titles[platform] = generated.title; initial[platform] = generated.content; return generated.content },
    async (drafts) => {
      progress('review')
      const reviewed = await reviewVersions(call, drafts, config.platformPrompts, { title: request.title, audience: request.audience, plan, sources, instruction: request.instruction }, (platform, suggestion) => { feedback[platform] = suggestion })
      for (const platform of request.platforms) {
        const body = reviewed.drafts[platform], title = titles[platform]
        if (!body || !title) continue
        reviewed.drafts[platform] = removeLeadingTitle(body, [title, ...(existing && 'expectedTitle' in existing ? [request.title] : [])])
      }
      return reviewed
    },
    () => progress('save'), existing)
  result.warnings = [...searchWarnings, ...(result.warnings ?? [])]
  if (result.draft) {
    for (const platform of result.draft.platforms) {
      try { if (!existing || !('expectedTitle' in existing)) if (titles[platform]) await savePlatformTitle(config.draftsDirectory, result.draft.id, platform, titles[platform], null) } catch { result.warnings.push(`${platform}标题保存失败，正文已保留，请检查标题。`) }
      try {
        const article = await readDraft(config.draftsDirectory, result.draft.id, platform)
        const record: ResearchRecord = { version: 1, status: request.research === 'online' ? 'sources_found' : 'skipped', checkedAt: new Date().toISOString(), sources: sources.map(({ title, url, retrievedAt, fetched, origin }) => ({ title, url, retrievedAt, fetched, ...(origin ? { origin } : {}) })), pending: plan.pending, warnings: result.warnings, articleVersion: article.version, trace: { platformPrompt: resolvePlatformPrompts(config.platformPrompts)[platform], titlePrompt: resolveTitlePrompts(config.titlePrompts)[platform], instruction: request.instruction ?? '', commonFacts: plan.commonFacts, outline: plan.platforms[platform] ?? '', initialTitle: titles[platform] ?? '', initialContent: (initial[platform] ?? '').slice(0, 30000), reviewFeedback: (feedback[platform] ?? '').slice(0, 4000), finalContent: article.content.slice(0, 30000) }, ...(searchPlan ? { searchPlan } : {}) }
        await deps.saveResearch(config.draftsDirectory, result.draft.id, platform, record)
      } catch { result.warnings.push(`${platform}核查资料保存失败，请重新收集来源。`) }
    }
  }
  return result
}
