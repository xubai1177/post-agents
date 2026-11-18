import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { constants } from 'node:fs'
import { lstat, open, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { publicAddress } from '../../infrastructure/public-network'
import type { ResearchRecord, ResearchSource } from '../../../shared/research'

export interface SourceMaterial extends ResearchSource { text: string }
export function parseSearch(text: string, time: string): SourceMaterial[] {
  const matches = [...text.matchAll(/(?:^|\n)\s*\d+\.\s+([^\n]{1,400}?)\s+[—–-]\s+(https?:\/\/[^\s<>]+)([^]*?)(?=\n\s*\d+\.\s+[^\n]+?\s+[—–-]\s+https?:\/\/|$)/g)]
  const seen = new Set<string>()
  return matches.flatMap((match) => {
    try {
      const url = new URL(match[2].replace(/[，。),]+$/, ''))
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || seen.has(url.href)) return []
      seen.add(url.href)
      return [{ title: match[1].trim().slice(0, 300), url: url.href, retrievedAt: time, fetched: false, text: match[3].trim().slice(0, 3000) }]
    } catch { return [] }
  }).sort((a, b) => Number(/(?:\.gov\.cn|\.gov|\.edu\.cn|\.edu)(?:\/|$)/i.test(b.url)) - Number(/(?:\.gov\.cn|\.gov|\.edu\.cn|\.edu)(?:\/|$)/i.test(a.url))).slice(0, 5)
}
function toolText(result: unknown): string {
  if (!result || typeof result !== 'object' || !('content' in result) || !Array.isArray(result.content) || ('isError' in result && result.isError)) throw new Error('search failed')
  const text = result.content.flatMap((item: unknown) => item && typeof item === 'object' && 'type' in item && item.type === 'text' && 'text' in item && typeof item.text === 'string' ? [item.text] : []).join('\n')
  if (!text.trim()) throw new Error('empty search')
  return text
}
async function safeToFetch(raw: string): Promise<boolean> {
  try {
    const url = new URL(raw); const host = url.hostname.replace(/^\[|\]$/g, '')
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || isIP(host) || host === 'localhost' || host.endsWith('.local')) return false
    const records = await lookup(host, { all: true })
    return records.length > 0 && records.every((record) => publicAddress(record.address, record.family))
  } catch { return false }
}
export async function researchTopic(topic: string, onProgress?: (phase: 'search' | 'read', sources: SourceMaterial[]) => void): Promise<SourceMaterial[]> {
  const key = process.env.REVIEW_MODEL_API_KEY
  const url = process.env.MAGPIE_SEARCH_URL || 'http://127.0.0.1:3425/mcp/magpie/web-search'
  const endpoint = new URL(url)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) || endpoint.protocol !== 'http:' || endpoint.username || endpoint.password) throw new Error('invalid search endpoint')
  const client = new Client({ name: 'post-agents', version: '0.1.0' })
  try {
    await client.connect(new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: key ? { authorization: `Bearer ${key}` } : {} } }), { timeout: 15000 })
    const found = await client.callTool({ name: 'web_search', arguments: { query: topic, count: 6, search_context_size: 'medium' } }, undefined, { timeout: 45000 })
    const sources = parseSearch(toolText(found), new Date().toISOString())
    if (!sources.length) throw new Error('no results')
    onProgress?.('read', sources)
    for (const source of sources.slice(0, 3)) {
      if (!await safeToFetch(source.url)) continue
      try {
        const page = await client.callTool({ name: 'web_fetch', arguments: { url: source.url, max_chars: 9000 } }, undefined, { timeout: 25000 })
        const text = toolText(page)
        if (text.trim().length >= 100) { source.text = text.slice(0, 9000); source.fetched = true }
      } catch { /* Retain the search excerpt and indicate it was not fetched. */ }
    }
    onProgress?.('read', sources)
    return sources
  } finally { await client.close().catch(() => undefined) }
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
      const stat = await handle.stat(); if (!stat.isFile() || stat.size > 100000) throw new Error('invalid research')
      const value: unknown = JSON.parse(await handle.readFile('utf8'))
      if (!value || typeof value !== 'object') throw new Error('invalid research')
      const r = value as ResearchRecord
      if (r.version !== 1 || !['sources_found', 'skipped'].includes(r.status) || typeof r.checkedAt !== 'string' || !Array.isArray(r.sources) || !Array.isArray(r.pending) || !Array.isArray(r.warnings)) throw new Error('invalid research')
      return { version: 1, status: r.status, checkedAt: r.checkedAt, sources: r.sources.filter((s) => s && typeof s.title === 'string' && typeof s.url === 'string' && typeof s.retrievedAt === 'string' && typeof s.fetched === 'boolean').slice(0, 10), pending: r.pending.filter((s) => typeof s === 'string').slice(0, 20), warnings: r.warnings.filter((s) => typeof s === 'string').slice(0, 20) }
    } finally { await handle.close() }
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}
