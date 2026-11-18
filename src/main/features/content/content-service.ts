import { ResearchUnavailableError } from '../../errors'
import type { CreateRequest, CreateResult } from '../../../shared/drafts'
import type { GenerationProgress, ResearchRecord } from '../../../shared/research'
import { generateDrafts } from './generation'
import { researchTopic, saveResearch, type SourceMaterial } from '../research/research'
import { planContent, writeContent, reviewVersions } from './content-pipeline'
import { createTextModel } from '../../infrastructure/text-model'

const defaults = { research: researchTopic, saveResearch, createModel: createTextModel }
export async function generateContent(request: CreateRequest, config: { draftsDirectory: string; apiUrl: string; model: string; apiKey: string }, progress: (phase: GenerationProgress) => void, deps: typeof defaults = defaults): Promise<CreateResult> {
  if (!config.draftsDirectory) throw new Error('请先在设置中选择草稿目录。')
  if (!config.apiUrl || !config.model || !config.apiKey) throw new Error('请先在设置中配置模型地址、模型名称和密钥。')
  let sources: SourceMaterial[] = []
  if (request.research === 'online') {
    progress('research')
    try { sources = await deps.research(request.title) } catch { throw new ResearchUnavailableError() }
  }
  const call = deps.createModel(config)
  progress('plan')
  let plan
  try { plan = await planContent(call, request.title, request.audience, request.platforms, sources) } catch { throw new Error('内容策划失败，请重试。') }
  progress('write')
  const result = await generateDrafts(config.draftsDirectory, request,
    (platform) => writeContent(call, request.title, request.audience, platform, plan, sources),
    async (drafts) => { progress('review'); return reviewVersions(call, drafts) },
    () => progress('save'))
  if (result.draft) {
    const record: ResearchRecord = { version: 1, status: request.research === 'online' ? 'sources_found' : 'skipped', checkedAt: new Date().toISOString(), sources: sources.map(({ title, url, retrievedAt, fetched }) => ({ title, url, retrievedAt, fetched })), pending: plan.pending, warnings: result.warnings ?? [] }
    try { await deps.saveResearch(config.draftsDirectory, result.draft.id, record) } catch { result.warnings = [...(result.warnings ?? []), '核查资料保存失败，请重新收集来源。'] }
  }
  return result
}
