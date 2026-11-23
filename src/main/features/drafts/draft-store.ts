import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { platforms, type Draft, type Document, type Platform } from '../../../shared/drafts'

let saveQueue: Promise<unknown> = Promise.resolve()
function validName(value: string): boolean { return !!value && value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\') && !value.includes('\0') }
function hash(content: string): string { return createHash('sha256').update(content).digest('hex') }
async function isDirectory(path: string): Promise<boolean> { try { const s = await lstat(path); return s.isDirectory() && !s.isSymbolicLink() } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e } }
async function filePath(root: string, id: string, platform: Platform): Promise<string> {
  if (!root || !validName(id) || !platforms.includes(platform) || !await isDirectory(join(root, id)) || !await isDirectory(join(root, id, platform))) throw new Error('草稿不存在或路径无效。')
  const path = join(root, id, platform, '发布文案.md')
  const file = await lstat(path)
  if (!file.isFile() || file.isSymbolicLink()) throw new Error('草稿文件无效。')
  return path
}
export async function listDrafts(root: string): Promise<Draft[]> {
  if (!root) throw new Error('请先在设置中选择草稿目录。')
  const entries = await readdir(root, { withFileTypes: true })
  const results: Draft[] = []
  for (const item of entries) {
    if (!item.isDirectory() || !validName(item.name)) continue
    const found: Platform[] = []
    for (const platform of platforms) {
      try { await filePath(root, item.name, platform); found.push(platform) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT' && !(e instanceof Error && e.message === '草稿不存在或路径无效。')) throw e }
    }
    if (found.length) results.push({ id: item.name, title: item.name, platforms: found })
  }
  return results.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
}
export async function readDraft(root: string, id: string, platform: Platform): Promise<Document> {
  const content = await readFile(await filePath(root, id, platform), 'utf8')
  return { content, version: hash(content) }
}
export function saveDraft(root: string, id: string, platform: Platform, content: string, version: string): Promise<Document> {
  const pending = saveQueue.then(() => saveDraftExclusive(root, id, platform, content, version))
  saveQueue = pending.catch(() => undefined)
  return pending
}
export function saveDraftWithTitle(root: string, id: string, platform: Platform, content: string, version: string, expectedTitle: string | null): Promise<Document> {
  const pending = saveQueue.then(async () => {
    if (await readPlatformTitle(root, id, platform) !== expectedTitle) throw new Error('平台标题已被外部修改，请重新打开后重试。')
    return saveDraftExclusive(root, id, platform, content, version)
  })
  saveQueue = pending.catch(() => undefined)
  return pending
}
async function saveDraftExclusive(root: string, id: string, platform: Platform, content: string, version: string): Promise<Document> {
  if (typeof content !== 'string' || content.length > 2_000_000 || !/^[a-f0-9]{64}$/.test(version)) throw new Error('文案内容无效。')
  const path = await filePath(root, id, platform)
  const previous = await readFile(path, 'utf8')
  if (hash(previous) !== version) throw new Error('文件已被外部修改，请重新打开后再保存。')
  const temp = join(root, id, platform, `.draft-${randomUUID()}.tmp`)
  try {
    await writeFile(temp, content, { flag: 'wx' })
    if (hash(await readFile(path, 'utf8')) !== version) throw new Error('文件已被外部修改，请重新打开后再保存。')
    await rename(temp, path)
  } finally { await rm(temp, { force: true }) }
  return { content, version: hash(content) }
}
export function safeTitle(title: string): string {
  let safe = title.replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').trim().replace(/\s+/g, ' ').replace(/[. ]+$/g, '').slice(0, 100)
  while (Buffer.byteLength(safe, 'utf8') > 180) safe = Array.from(safe).slice(0, -1).join('')
  if (!validName(safe)) throw new Error('主题不能作为文件夹名称。')
  return safe
}
export async function createTopic(root: string, title: string): Promise<string> {
  const id = safeTitle(title)
  try { await mkdir(join(root, id)) } catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('已有同名主题，请更换主题名称。'); throw e }
  return id
}
export async function createPlatform(root: string, id: string, platform: Platform, content: string): Promise<void> {
  if (!validName(id) || !platforms.includes(platform) || !await isDirectory(join(root, id))) throw new Error('草稿路径无效。')
  const dir = join(root, id, platform)
  await mkdir(dir)
  try { await writeFile(join(dir, '发布文案.md'), content, { flag: 'wx' }) } catch (error) { try { await rmdir(dir) } catch { /* Keep any non-empty directory. */ }; throw error }
}

// 平台标题与正文分开保存；不存在标题文件的旧文章保持原样。
export async function readPlatformTitle(root: string, id: string, platform: Platform): Promise<string | null> {
  const bodyPath = await filePath(root, id, platform)
  const titlePath = join(bodyPath, '..', '标题.txt')
  try {
    const info = await lstat(titlePath)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('标题文件无效。')
    const title = await readFile(titlePath, 'utf8')
    if (!title.trim() || title.length > 500 || /[\r\n\0]/.test(title)) throw new Error('标题文件无效。')
    return title
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}
export function savePlatformTitle(root: string, id: string, platform: Platform, title: string, expected: string | null): Promise<string> {
  const pending = saveQueue.then(async () => {
    if (!title.trim() || title.length > 500 || /[\r\n\0]/.test(title)) throw new Error('平台标题无效。')
    const bodyPath = await filePath(root, id, platform)
    const titlePath = join(bodyPath, '..', '标题.txt')
    if (await readPlatformTitle(root, id, platform) !== expected) throw new Error('平台标题已被外部修改，请重新打开后重试。')
    const temp = join(bodyPath, '..', `.title-${randomUUID()}.tmp`)
    try {
      await writeFile(temp, title, { flag: 'wx' })
      if (await readPlatformTitle(root, id, platform) !== expected) throw new Error('平台标题已被外部修改，请重新打开后重试。')
      await rename(temp, titlePath)
    } finally { await rm(temp, { force: true }) }
    return title
  })
  saveQueue = pending.catch(() => undefined)
  return pending
}
