export async function fetchModelList(apiUrl: string, apiKey: string, request: typeof fetch = fetch): Promise<string[]> {
  let url: URL
  try {
    url = new URL(apiUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || apiUrl.length > 2048) throw new Error()
  } catch { throw new Error('模型列表：请输入有效的 API 地址。') }
  if (!apiKey.trim() || apiKey.length > 8192 || /[\r\n\0]/.test(apiKey)) throw new Error('模型列表：请先填写 API 密钥。')
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/models`
  let response: Response
  try { response = await request(url, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000), redirect: 'error' }) }
  catch { throw new Error('模型列表：无法连接服务，请检查地址和网络。') }
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '模型列表：鉴权失败，请检查密钥。' : '模型列表：服务未返回列表，请检查地址或手动输入模型名称。')
  const length = Number(response.headers.get('content-length'))
  if (length > 2_000_000) throw new Error('模型列表：服务返回的数据过大。')
  let data: unknown
  try { const text = await response.text(); if (text.length > 2_000_000) throw new Error(); data = JSON.parse(text) } catch { throw new Error('模型列表：服务返回的数据格式无效。') }
  if (!data || typeof data !== 'object' || !('data' in data) || !Array.isArray(data.data)) throw new Error('模型列表：服务返回的数据格式无效。')
  return [...new Set(data.data.flatMap((item: unknown) => item && typeof item === 'object' && 'id' in item && typeof item.id === 'string' && item.id.trim() && item.id.length <= 512 && !/[\0\r\n]/.test(item.id) ? [item.id] : []))].sort().slice(0, 5000)
}
