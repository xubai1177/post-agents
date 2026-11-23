import { constants } from 'node:fs'
import { lstat, open, writeFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Platform } from '../../../shared/drafts'
import { researchWithModel } from '../../infrastructure/model-search'
import type { ResearchRecord, ResearchSource } from '../../../shared/research'

export interface SourceMaterial extends ResearchSource { text: string; searchSummary?: string }
export type SearchConfig = { apiUrl: string; model: string; apiKey: string }
export async function researchTopic(config: SearchConfig, topic: string, onProgress?: (phase: 'search' | 'read', sources: SourceMaterial[]) => void, search: typeof researchWithModel = researchWithModel, mode: 'topic' | 'article' = 'topic'): Promise<SourceMaterial[]> {
  const sources = await search(config, topic)
  onProgress?.('read', sources)
  const summary = sources.find(source => source.searchSummary)?.searchSummary
  if (!summary) return sources
  // A provider without per-claim citations needs a separate, date-aware search.
  // Both outputs remain model summaries and must not be presented as page text.
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  try {
    const checks = await search(config, mode === 'article' ? `核对以下创作任务的联网摘要，检查来源是否支持结论，并根据主题核对时效和适用范围；涉及政策时核对年度、地区、对象和各办理阶段，区分本期与往期。无法确认的标记待核。任务：${topic}\n待核摘要：${summary.slice(0, 8000)}` : `核对主题“${topic}”的检索摘要。今天是${date}。请优先查阅官方原始公告，逐项检查具体年份、适用周期、对象、金额、办理及截止日期，区分本期与往期，不要将上一期领取期限套用本期；将不确定和冲突明确标出。为每个具体结论给出原文链接及对应原文内容，不能确认就标记未核实。待核摘要：${summary.slice(0, 8000)}`)
    const existing = new Set(sources.map(source => source.url))
    const added = checks.filter(source => !existing.has(source.url)).slice(0, Math.max(0, 10 - sources.length))
    const checkSummary = checks.find(source => source.searchSummary)?.searchSummary
    const checkText = checkSummary || checks.filter(source => source.text).map(source => `${source.title} ${source.url}：${source.text}`).join('\n')
    if (checkText) sources[0] = { ...sources[0], searchSummary: `【独立联网复核摘要】\n${checkText}\n\n【原始联网综合摘要】\n${summary}` }
    return [...sources, ...added.map(source => ({ ...source, searchSummary: undefined }))]
  } catch {
    sources[0] = { ...sources[0], searchSummary: `【原始联网综合摘要，独立联网复核未完成】\n${summary}` }
    return sources
  }
}
function validId(id: string): boolean { return !!id && id !== '.' && id !== '..' && !id.includes('/') && !id.includes('\\') && !id.includes('\0') }
async function recordPath(root: string, id: string): Promise<string> {
  if (!root || !validId(id)) throw new Error('invalid path')
  const dir = join(root, id); const info = await lstat(dir)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('invalid path')
  return join(dir, '.research.json')
}
export async function saveResearch(root: string, id: string, data: ResearchRecord): Promise<void> { await writeFile(await recordPath(root, id), JSON.stringify(data, null, 2), { flag: 'wx', mode: 0o600 }) }
export async function readResearch(root: string, id: string): Promise<ResearchRecord | null> {
  try {
    const path = await recordPath(root, id)
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const stat = await handle.stat(); if (!stat.isFile() || stat.size > 400000) throw new Error('invalid research')
      const value: unknown = JSON.parse(await handle.readFile('utf8'))
      if (!value || typeof value !== 'object') throw new Error('invalid research')
      const r = value as ResearchRecord
      if (r.version !== 1 || !['sources_found', 'skipped'].includes(r.status) || typeof r.checkedAt !== 'string' || !Array.isArray(r.sources) || !Array.isArray(r.pending) || !Array.isArray(r.warnings)) throw new Error('invalid research')
      return { version: 1, status: r.status, checkedAt: r.checkedAt, sources: r.sources.filter((s) => s && typeof s.title === 'string' && typeof s.url === 'string' && typeof s.retrievedAt === 'string' && typeof s.fetched === 'boolean').slice(0, 10), pending: r.pending.filter((s) => typeof s === 'string').slice(0, 20), warnings: r.warnings.filter((s) => typeof s === 'string').slice(0, 20) }
    } finally { await handle.close() }
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}

const platformFiles: Record<Platform, string> = { 小红书: '.research-xiaohongshu.json', 公众号: '.research-wechat.json', 抖音图文: '.research-douyin.json' }
export async function savePlatformResearch(root: string, id: string, platform: Platform, data: ResearchRecord): Promise<void> {
  const base = await recordPath(root, id)
  const path = join(base.slice(0, -'.research.json'.length), platformFiles[platform])
  const temporary = `${path}.${randomUUID()}.tmp`
  try { await writeFile(temporary, JSON.stringify(data, null, 2), { flag: 'wx', mode: 0o600 }); await rename(temporary, path) }
  finally { await rm(temporary, { force: true }) }
}
export async function readPlatformResearch(root: string, id: string, platform: Platform): Promise<ResearchRecord | null> {
  const base = await recordPath(root, id)
  const path = join(base.slice(0, -'.research.json'.length), platformFiles[platform])
  try {
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const stat = await handle.stat(); if (!stat.isFile() || stat.size > 400000) throw new Error('invalid research')
      const value: unknown = JSON.parse(await handle.readFile('utf8'))
      if (!value || typeof value !== 'object') throw new Error('invalid research')
      const r = value as ResearchRecord
      if (r.version !== 1 || !['sources_found', 'skipped'].includes(r.status) || typeof r.checkedAt !== 'string' || !Array.isArray(r.sources) || !Array.isArray(r.pending) || !Array.isArray(r.warnings) || typeof r.articleVersion !== 'string' || (r.searchPlan !== undefined && typeof r.searchPlan !== 'string')) throw new Error('invalid research')
      return { ...r, sources: r.sources.filter(s => s && typeof s.title === 'string' && typeof s.url === 'string' && typeof s.retrievedAt === 'string' && typeof s.fetched === 'boolean').slice(0, 10), pending: r.pending.filter(s => typeof s === 'string').slice(0, 20), warnings: r.warnings.filter(s => typeof s === 'string').slice(0, 20) }
    } finally { await handle.close() }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const legacy = await readResearch(root, id)
    return legacy ? { ...legacy, legacy: true } : null
  }
}
