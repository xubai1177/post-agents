import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { platforms } from '../../../shared/drafts'
import { isTopicCount } from '../../../shared/topics'
import type { TopicWorkspace } from '../../../shared/topics'

const file = '.post-agents-topics.json'
const empty = (): TopicWorkspace => ({ version: 1, batches: [], tasks: [] })
export function validateTopicWorkspace(value: unknown): TopicWorkspace {
  if (!value || typeof value !== 'object') throw new Error('选题记录格式无效。')
  const input = value as TopicWorkspace
  const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max
  if (input.version !== 1 || !Array.isArray(input.batches) || input.batches.length > 1000 || !Array.isArray(input.tasks) || input.tasks.length > 5000) throw new Error('选题记录格式无效。')
  for (const record of input.batches) {
    const b = record?.batch
    if (!text(record?.id, 80) || !text(record.createdAt, 40) || !b || !text(b.request?.direction, 100) || !text(b.request?.audience, 500) || (b.request?.count !== undefined && !isTopicCount(b.request.count)) || !Array.isArray(b.request?.platforms) || !b.request.platforms.every(p => platforms.includes(p)) || !Array.isArray(b.candidates) || b.candidates.length > 100 || !Array.isArray(b.sources) || b.sources.length > 100 || typeof b.skipped !== 'boolean') throw new Error('选题记录格式无效。')
    for (const c of b.candidates) if (!text(c.title, 200) || !text(c.angle, 4000) || !text(c.reason, 4000) || !Array.isArray(c.platforms) || !c.platforms.every(p => platforms.includes(p)) || !Array.isArray(c.sourceIndexes) || !c.sourceIndexes.every(n => Number.isInteger(n) && n > 0 && n <= b.sources.length) || !Array.isArray(c.pending) || !c.pending.every(v => text(v, 4000))) throw new Error('选题记录格式无效。')
    for (const s of b.sources) if (!text(s.title, 4000) || !text(s.url, 4096) || !text(s.retrievedAt, 100) || typeof s.fetched !== 'boolean') throw new Error('选题记录格式无效。')
  }
  if (input.topicRuns !== undefined) {
    if (!Array.isArray(input.topicRuns) || input.topicRuns.length > 5000) throw new Error('选题任务格式无效。')
    for (const run of input.topicRuns) {
      if (!run || !text(run.id, 80) || !text(run.createdAt, 40) || !run.request || !text(run.request.direction, 100) || !text(run.request.audience, 500) || (run.request.count !== undefined && !isTopicCount(run.request.count)) || !Array.isArray(run.request.platforms) || !run.request.platforms.length || !run.request.platforms.every(p => platforms.includes(p)) || !['queued', 'running', 'waiting', 'done', 'failed', 'interrupted'].includes(run.status) || !['search', 'read', 'generate', 'organize'].includes(run.phase) || (run.message !== undefined && !text(run.message, 10000)) || (run.recordId !== undefined && !text(run.recordId, 80))) throw new Error('选题任务格式无效。')
    }
  }
  for (const t of input.tasks) if (!text(t.id, 80) || !text(t.batchId, 80) || !Number.isInteger(t.index) || t.index < 0 || !text(t.title, 200) || !['running','done','failed','interrupted'].includes(t.status) || (t.draftId !== undefined && !text(t.draftId, 255)) || (t.message !== undefined && !text(t.message, 10000))) throw new Error('选题任务格式无效。')
  return input
}
export async function readTopicWorkspace(root: string): Promise<TopicWorkspace> {
  if (!root) throw new Error('请先选择工作空间。')
  try { return validateTopicWorkspace(JSON.parse(await readFile(join(root, file), 'utf8')) as unknown) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty(); throw error }
}
const writes = new Map<string, Promise<unknown>>()
async function writeFileAtomic(root: string, value: unknown): Promise<TopicWorkspace> {
  if (!root) throw new Error('请先选择工作空间。')
  const data = validateTopicWorkspace(value), json = JSON.stringify(data, null, 2)
  if (Buffer.byteLength(json) > 8 * 1024 * 1024) throw new Error('选题记录过大。')
  const temporary = join(root, `.topics-${randomUUID()}.tmp`)
  try { await writeFile(temporary, json, { flag: 'wx', mode: 0o600 }); await rename(temporary, join(root, file)) } finally { await rm(temporary, { force: true }) }
  return data
}
export function updateTopicWorkspace(root: string, update: (data: TopicWorkspace) => TopicWorkspace): Promise<TopicWorkspace> {
  const pending = (writes.get(root) ?? Promise.resolve()).then(async () => { const current = await readTopicWorkspace(root), next = update(current); return next === current ? current : writeFileAtomic(root, next) })
  const settled = pending.catch(() => undefined)
  writes.set(root, settled)
  void settled.then(() => { if (writes.get(root) === settled) writes.delete(root) })
  return pending
}
export function writeTopicWorkspace(root: string, value: unknown): Promise<TopicWorkspace> {
  return updateTopicWorkspace(root, () => validateTopicWorkspace(value))
}
