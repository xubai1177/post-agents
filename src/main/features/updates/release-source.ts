export const updateOrigin = 'https://update.dknx.top/linggao-ai'
export type ReleaseDetails = { version: string; notes: string }
type Fetch = (url: string, options: RequestInit) => Promise<Response>

export async function fetchLatestRelease(fetcher: Fetch): Promise<ReleaseDetails> {
  const response = await fetcher(`${updateOrigin}/latest.json`, {
    headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(12000), redirect: 'error'
  })
  if (!response.ok) throw new Error('无法读取更新信息，请检查网络后重试。')
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object' || !('version' in data) || typeof data.version !== 'string' ||
      !/^\d+\.\d+\.\d+$/.test(data.version) || !('notes' in data) || typeof data.notes !== 'string' || data.notes.length > 30000) {
    throw new Error('更新信息无效，请稍后重试。')
  }
  return { version: data.version, notes: data.notes }
}
