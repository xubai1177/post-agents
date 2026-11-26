const maxImageBytes = 3 * 1024 * 1024
export function imageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || !(url.hostname === 'xhscdn.com' || url.hostname.endsWith('.xhscdn.com'))) return null
    url.protocol = 'https:'
    return url.href
  } catch { return null }
}
function imageType(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif'
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp' && ['avif', 'avis'].includes(bytes.toString('ascii', 8, 12))) return 'image/avif'
  return null
}
const cache = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()
let active = 0
const waiting: (() => void)[] = []
async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (active >= 4) await new Promise<void>(resolve => waiting.push(resolve))
  else active++
  try { return await run() } finally { const next = waiting.shift(); if (next) next(); else active-- }
}
export function clearMedia(): void { cache.clear() }
export async function readImage(value: string): Promise<string | null> {
  const url = imageUrl(value); if (!url) return null
  const existing = cache.get(url); if (existing) return existing
  const running = pending.get(url); if (running) return running
  const request = slot(async () => {
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12000), headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' } })
      if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maxImageBytes) return null
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
      while (true) { const { done, value: chunk } = await reader.read(); if (done) break; size += chunk.length; if (size > maxImageBytes) { await reader.cancel(); return null }; chunks.push(chunk) }
      const bytes = Buffer.concat(chunks), mime = imageType(bytes); if (!mime) return null
      const result = `data:${mime};base64,${bytes.toString('base64')}`
      if (cache.size >= 24) { const first = cache.keys().next().value; if (first) cache.delete(first) }
      cache.set(url, result); return result
    } catch { return null }
  }).finally(() => pending.delete(url))
  pending.set(url, request); return request
}
