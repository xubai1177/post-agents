import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'
import { publicAddress } from './public-network'

const maxBytes = 15 * 1024 * 1024
async function download(urlString: string): Promise<Buffer> {
  const url = new URL(urlString)
  if (url.protocol !== 'https:' || url.username || url.password || isIP(url.hostname.replace(/^\[|\]$/g, ''))) throw new Error('图片地址无效。')
  const records = await lookup(url.hostname, { all: true })
  if (!records.length || records.some((item) => !publicAddress(item.address, item.family))) throw new Error('图片地址无效。')
  const chosen = records[0]
  return new Promise((resolve, reject) => {
    const req = request(url, { timeout: 30000, lookup: (_hostname, _options, callback) => callback(null, chosen.address, chosen.family) }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('下载图片失败。')); return }
      const chunks: Buffer[] = []; let total = 0
      res.on('data', (chunk: Buffer) => { total += chunk.length; if (total > maxBytes) { res.destroy(new Error('图片过大。')); return } chunks.push(chunk) })
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('下载超时。')))
    req.on('error', reject); req.end()
  })
}
export async function requestImageWithUsage(config: { apiUrl: string; model: string; apiKey: string }, prompt: string, onUsage?: (usage: unknown) => void): Promise<{ bytes: Buffer; usage: unknown }> {
  const base = new URL(config.apiUrl.endsWith('/') ? config.apiUrl : `${config.apiUrl}/`)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('图片服务地址无效。')
  const endpoint = new URL('images/generations', base)
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, prompt, n: 1 }), signal: AbortSignal.timeout(120000), redirect: 'error' })
  if (!response.ok || !response.body) throw new Error('图片服务请求失败。')
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > maxBytes * 2) { await reader.cancel(); throw new Error('图片响应过大。') }; chunks.push(value) }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!parsed || typeof parsed !== 'object' || !('data' in parsed) || !Array.isArray(parsed.data) || !parsed.data[0] || typeof parsed.data[0] !== 'object') throw new Error('图片服务响应无效。')
  onUsage?.('usage' in parsed ? parsed.usage : null)
  const entry: Record<string, unknown> = parsed.data[0]
  if (typeof entry.b64_json === 'string') { if (entry.b64_json.length > maxBytes * 1.4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(entry.b64_json)) throw new Error('图片数据无效。'); return { bytes: Buffer.from(entry.b64_json, 'base64'), usage: 'usage' in parsed ? parsed.usage : null } }
  if (typeof entry.url === 'string' && entry.url.length < 8192) return { bytes: await download(entry.url), usage: 'usage' in parsed ? parsed.usage : null }
  throw new Error('图片服务未返回图片。')
}

export async function requestImage(config: { apiUrl: string; model: string; apiKey: string }, prompt: string): Promise<Buffer> { return (await requestImageWithUsage(config, prompt)).bytes }
