import { BrowserWindow, session, shell } from 'electron'
import type { DiscoveryAccount, DiscoveryDetail, DiscoveryItem } from '../../../shared/discovery'
import { buildSearchUrl, parseFeeds } from './parse'
import { clearMedia, imageUrl, readImage } from './media'

const partition = 'persist:xiaohongshu-discovery'
let loginWindow: BrowserWindow | undefined
let links = new Map<string, string>()
let covers = new Map<string, string>()
let detailImages = new Map<string, string[]>()
let sessionVersion = 0
type PrivateDetail = DiscoveryDetail & { sourceUrl: string }
let details = new Map<string, PrivateDetail>()
let busy = false
let configuredSession = false
const origin = 'https://www.xiaohongshu.com'
function allowed(url: string): boolean { try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'www.xiaohongshu.com' && !u.username && !u.password } catch { return false } }
function isolate(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  window.webContents.on('will-navigate', (event, url) => { if (!allowed(url)) event.preventDefault() })
  window.webContents.on('will-redirect', (event, url) => { if (!allowed(url)) event.preventDefault() })
}
function create(show: boolean): BrowserWindow {
  const ses = session.fromPartition(partition)
  if (!configuredSession) {
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    ses.setPermissionCheckHandler(() => false)
    ses.on('will-download', event => event.preventDefault())
    configuredSession = true
  }
  const window = new BrowserWindow({ width: 1080, height: 760, show, title: '小红书', webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } })
  isolate(window)
  return window
}
export async function login(): Promise<void> {
  if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.show(); loginWindow.focus(); return }
  const window = create(true); loginWindow = window
  window.once('closed', () => { if (loginWindow === window) loginWindow = undefined })
  try { await window.loadURL(`${origin}/explore`) } catch { window.close(); throw new Error('发现操作：无法打开小红书登录页面。') }
}
export async function logout(): Promise<void> {
  if (busy) throw new Error('发现操作：请等待当前读取完成。')
  if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close()
  await session.fromPartition(partition).clearStorageData()
  sessionVersion++; links.clear(); details.clear(); covers.clear(); detailImages.clear(); clearMedia()
}
async function withPage<T>(url: string, read: (window: BrowserWindow) => Promise<T>, exclusive = true): Promise<T> {
  if (exclusive && busy) throw new Error('发现操作：正在读取，请稍候。')
  if (!allowed(url)) throw new Error('发现操作：无效的帖子地址。')
  if (exclusive) busy = true
  let window: BrowserWindow | undefined
  try {
    window = create(false)
    let timer: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([window.loadURL(url), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('发现操作：连接小红书超时，请稍后重试。')), 20000) })]) } finally { if (timer) clearTimeout(timer) }
    return await read(window)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('发现操作：')) throw error
    const code = error instanceof Error ? error.message.match(/\bERR_[A-Z_]+\b/)?.[0] : undefined
    throw new Error(`发现操作：读取失败${code ? `（${code}）` : ''}，请检查网络或重新登录小红书。`)
  } finally { if (window && !window.isDestroyed()) window.destroy(); if (exclusive) busy = false }
}
async function poll<T>(window: BrowserWindow, script: string, validate: (v: unknown) => T | null): Promise<T> {
  const deadline = Date.now() + 12000
  while (Date.now() < deadline) {
    if (!allowed(window.webContents.getURL())) throw new Error('发现操作：页面跳转异常，请重新登录。')
    const raw: unknown = await window.webContents.executeJavaScript(script)
    const value = validate(raw)
    if (value !== null) return value
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  throw new Error('发现操作：未能读取内容，请确认已登录并重试。')
}
export async function search(query: string): Promise<DiscoveryItem[]> {
  return withPage(buildSearchUrl(query), async window => {
    const data = await poll(window, `(() => { const f = window.__INITIAL_STATE__?.search?.feeds; const v = f?.value ?? f?._value; if (!Array.isArray(v)) return 'null'; const t = (x, n) => typeof x === 'string' ? x.slice(0, n) : ''; return JSON.stringify(v.slice(0, 100).map(x => ({ id: t(x?.id, 40), xsecToken: t(x?.xsecToken, 2048), noteCard: { displayTitle: t(x?.noteCard?.displayTitle, 300), user: { nickname: t(x?.noteCard?.user?.nickname, 120) }, interactInfo: { likedCount: t(x?.noteCard?.interactInfo?.likedCount, 30) }, cover: { urlDefault: t(x?.noteCard?.cover?.urlDefault, 4096), urlPre: t(x?.noteCard?.cover?.urlPre, 4096), url: t(x?.noteCard?.cover?.url, 4096) } } }))) })()`, value => {
      if (typeof value !== 'string') return null
      try { const result: unknown = JSON.parse(value); return Array.isArray(result) && result.length ? result : null } catch { return null }
    })
    const parsed = parseFeeds(data); links = parsed.urls; covers = parsed.covers; details = new Map(); detailImages = new Map(); clearMedia()
    if (!parsed.items.length) throw new Error('发现操作：没有读取到可用帖子，请更换主题或重新登录。')
    return parsed.items
  })
}
export async function detail(id: string): Promise<DiscoveryDetail> {
  const url = links.get(id); if (!url) throw new Error('发现操作：搜索结果已失效，请重新搜索。')
  const cached = details.get(id); if (cached) { const { sourceUrl: _sourceUrl, ...result } = cached; return result }
  return withPage(url, async window => {
    const result = await poll(window, `(() => { const m = window.__INITIAL_STATE__?.note?.noteDetailMap; const map = m?.value ?? m?._value ?? m; const entry = map?.[${JSON.stringify(id)}]; const images = entry?.note?.imageList ?? []; return JSON.stringify({ title: document.querySelector('#detail-title')?.textContent?.slice(0, 300) ?? '', content: document.querySelector('#detail-desc')?.innerText?.slice(0, 30001) ?? '', author: document.querySelector('.author .name')?.textContent?.slice(0, 120) ?? '', images: Array.isArray(images) ? images.slice(0, 20).map(i => typeof i?.urlDefault === 'string' ? i.urlDefault.slice(0, 4096) : typeof i?.url === 'string' ? i.url.slice(0, 4096) : '') : [] }) })()`, value => {
      if (typeof value !== 'string') return null
      try { const v: unknown = JSON.parse(value); if (!v || typeof v !== 'object') return null; const o = v as Record<string, unknown>; if (typeof o.title !== 'string' || typeof o.content !== 'string' || !o.title.trim() || !o.content.trim()) return null; if (o.content.length > 30000) throw new Error('发现操作：帖子正文过长，请打开原文查看。'); return { title: o.title.trim().slice(0, 300), content: o.content.trim().slice(0, 30000), author: typeof o.author === 'string' ? o.author.trim().slice(0, 120) : '', images: Array.isArray(o.images) ? o.images.map(imageUrl).filter((v): v is string => Boolean(v)).slice(0, 20) : [] } } catch (error) { if (error instanceof Error && error.message.startsWith('发现操作：')) throw error; return null }
    })
    const { images, ...body } = result; detailImages.set(id, images)
    const value = { ...body, id, imageCount: images.length, sourceUrl: url }; details.set(id, value); const { sourceUrl: _sourceUrl, ...visible } = value; return visible
  })
}
export function selectedDetail(id: string): PrivateDetail { const value = details.get(id); if (!value) throw new Error('发现操作：请先打开帖子详情。'); return value }
export async function openOriginal(id: string): Promise<void> { const url = links.get(id); if (!url || !allowed(url)) throw new Error('发现操作：搜索结果已失效。'); await shell.openExternal(url) }

export async function image(id: string, index: number): Promise<string | null> {
  if (!links.has(id)) throw new Error('发现操作：搜索结果已失效，请重新搜索。')
  const url = index === -1 ? covers.get(id) : detailImages.get(id)?.[index]
  return url ? readImage(url) : null
}
export async function account(): Promise<DiscoveryAccount> {
  const version = sessionVersion
  try {
    const status = await withPage(`${origin}/explore`, async window => poll(window, `(() => { const u = window.__INITIAL_STATE__?.user?.userInfo; const v = u?.value ?? u?._value ?? u; const name = typeof v?.nickname === 'string' ? v.nickname.slice(0, 120) : ''; const profile = [...document.querySelectorAll('a[href*="/user/profile/"]')].some(a => a.textContent?.trim() === '我'); const login = !!document.querySelector('#login-btn'); return JSON.stringify({ name, profile, login }) })()`, value => {
      if (typeof value !== 'string') return null
      try { const obj: unknown = JSON.parse(value); if (!obj || typeof obj !== 'object') return null; const o = obj as Record<string, unknown>; if (typeof o.name === 'string' && o.name.trim()) return { state: 'logged_in' as const, nickname: o.name.trim().slice(0, 120) }; if (o.profile === true) return { state: 'logged_in' as const, nickname: '' }; if (o.login === true) return { state: 'logged_out' as const }; return null } catch { return null }
    }), false)
    return version === sessionVersion ? status : { state: 'unknown' }
  } catch { return { state: 'unknown' } }
}
