import { ResearchUnavailableError } from '../../errors'
import { resolvePlatformPrompts, resolveTitlePrompts, type PlatformPrompts } from '../../../shared/platform-prompts'
import type { CreateRequest, CreateResult, Platform, TestPlatformPromptRequest, TestPlatformPromptResult } from '../../../shared/drafts'
import type { GenerationProgress, ResearchRecord } from '../../../shared/research'
import { generateDrafts } from './generation'
import { researchTopic, savePlatformResearch, type SourceMaterial } from '../research/research'
import { writeContent } from './content-pipeline'
import { generateTitleCandidates } from './titles'
import { readDraft, savePlatformTitle } from '../drafts/draft-store'
import { researchWithModel } from '../../infrastructure/model-search'
import { createTextModel } from '../../infrastructure/text-model'

const defaults = {
  research: (topic: string, config: { apiUrl: string; model: string; apiKey: string }) =>
    researchTopic(config, topic, undefined, (c, t) => researchWithModel(c, t, fetch, 'article'), 'article'),
  saveResearch: savePlatformResearch,
  createModel: createTextModel
}

function removeLeadingTitle(body: string, titles: string[]): string {
  const [first, ...rest] = body.trimStart().split(/\r?\n/)
  const text = first.trim().replace(/^#{1,6}\s+/, '').replace(/\s+#+$/, '').replace(/^\*\*(.+)\*\*$/, '$1').trim()
  const remaining = rest.join('\n').trimStart()
  return remaining && titles.includes(text) ? remaining : body
}

function creationContext(request: Pick<CreateRequest, 'title' | 'audience' | 'angle'>): string {
  return [`主题：${request.title}`, request.audience.trim() && `受众：${request.audience.trim()}`, request.angle?.trim() && `创作角度：${request.angle.trim()}`].filter(Boolean).join('\n')
}

export async function testPlatformPrompt(request: TestPlatformPromptRequest, call: ReturnType<typeof createTextModel>): Promise<TestPlatformPromptResult> {
  if (request.kind === 'title') return { kind: 'title', titles: await generateTitleCandidates(request.platform, request.content, request.rule, call) }
  const body = resolvePlatformPrompts({ [request.platform]: request.rule })[request.platform]
  const generated = await writeContent(call, request.platform, creationContext({ title: request.topic.trim(), audience: '' }), { body }, [])
  return { kind: 'body', content: removeLeadingTitle(generated.content, [request.topic.trim()]) }
}

export async function generateContent(
  request: CreateRequest,
  config: { draftsDirectory: string; apiUrl: string; model: string; apiKey: string; platformPrompts?: PlatformPrompts; titlePrompts?: PlatformPrompts },
  progress: (phase: GenerationProgress) => void,
  deps: typeof defaults = defaults,
  existing?: { id: string; versions: Partial<Record<Platform, string>>; expectedTitle?: string | null }
): Promise<CreateResult> {
  if (!config.draftsDirectory) throw new Error('请先在设置中选择草稿目录。')
  if (!config.apiUrl || !config.model || !config.apiKey) throw new Error('请先在设置中配置模型地址、模型名称和密钥。')

  const context = creationContext(request)
  let sources: SourceMaterial[] = []
  if (request.research === 'online') {
    progress('research')
    try { sources = await deps.research(context, config) } catch (error) { throw new ResearchUnavailableError(error) }
  }

  const call = deps.createModel(config)
  const bodies = resolvePlatformPrompts(config.platformPrompts)
  const titles = resolveTitlePrompts(config.titlePrompts)
  const generatedTitles: Partial<Record<Platform, string>> = {}
  const regenerating = existing && 'expectedTitle' in existing

  progress('write')
  const result = await generateDrafts(
    config.draftsDirectory, request,
    async platform => {
      const generated = await writeContent(call, platform, context, { body: bodies[platform], title: regenerating ? undefined : titles[platform] }, sources)
      if (generated.title !== undefined) generatedTitles[platform] = generated.title
      return removeLeadingTitle(generated.content, regenerating ? [request.title] : [generated.title ?? request.title])
    },
    () => progress('save'), existing
  )

  const warnings = result.warnings ?? []
  result.warnings = warnings
  if (!result.draft) return result

  for (const platform of result.draft.platforms) {
    const title = generatedTitles[platform]
    if (!regenerating && title) {
      try { await savePlatformTitle(config.draftsDirectory, result.draft.id, platform, title, null) }
      catch { warnings.push(`${platform}标题保存失败，正文已保留，请检查标题。`) }
    }
    try {
      const article = await readDraft(config.draftsDirectory, result.draft.id, platform)
      const record: ResearchRecord = {
        version: 1,
        status: request.research === 'online' ? 'sources_found' : 'skipped',
        checkedAt: new Date().toISOString(),
        sources: sources.map(({ title, url, retrievedAt, fetched, origin }) => ({ title, url, retrievedAt, fetched, ...(origin ? { origin } : {}) })),
        pending: [],
        warnings,
        articleVersion: article.version,
        trace: {
          platformPrompt: bodies[platform],
          titlePrompt: regenerating ? '' : titles[platform],
          initialTitle: regenerating ? '' : title ?? '',
          finalContent: article.content.slice(0, 30000)
        }
      }
      await deps.saveResearch(config.draftsDirectory, result.draft.id, platform, record)
    } catch { warnings.push(`${platform}生成记录保存失败，正文已保留。`) }
  }
  return result
}
