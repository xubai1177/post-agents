import type { DiscoveryItem } from '../../../shared/discovery'
import { imageUrl } from './media'
type RecordValue = Record<string, unknown>
function record(value: unknown): RecordValue | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null }
function text(value: unknown, max = 300): string { return typeof value === 'string' ? value.trim().slice(0, max) : '' }
export function buildSearchUrl(query: string): string {
  const url = new URL('https://www.xiaohongshu.com/search_result/')
  url.searchParams.set('keyword', query)
  return url.href
}
export function parseFeeds(value: unknown): { items: DiscoveryItem[]; urls: Map<string, string>; covers: Map<string, string> } {
  const items: DiscoveryItem[] = [], urls = new Map<string, string>(), covers = new Map<string, string>()
  if (!Array.isArray(value)) return { items, urls, covers }
  for (const entry of value.slice(0, 100)) {
    const data = record(entry), note = record(data?.noteCard), user = record(note?.user), interact = record(note?.interactInfo)
    const id = text(data?.id, 40), token = text(data?.xsecToken, 2048), title = text(note?.displayTitle)
    if (!/^[a-zA-Z0-9]{8,40}$/.test(id) || !/^[a-zA-Z0-9_=-]{1,2048}$/.test(token) || !title || urls.has(id)) continue
    const url = new URL(`https://www.xiaohongshu.com/explore/${id}`); url.searchParams.set('xsec_token', token); url.searchParams.set('xsec_source', 'pc_search')
    urls.set(id, url.href)
    const cover = record(note?.cover), image = imageUrl(cover?.urlDefault) ?? imageUrl(cover?.urlPre) ?? imageUrl(cover?.url)
    if (image) covers.set(id, image)
    items.push({ id, title, author: text(user?.nickname, 120), likes: text(interact?.likedCount, 30), hasCover: Boolean(image) })
    if (items.length === 50) break
  }
  return { items, urls, covers }
}
