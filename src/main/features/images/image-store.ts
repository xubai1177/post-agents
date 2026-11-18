import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, link, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readDraft } from '../drafts/draft-store'
import type { Platform } from '../../../shared/drafts'
import type { DraftImage } from '../../../shared/images'

const maxBytes = 15 * 1024 * 1024
export function imageType(bytes: Buffer): { mime: string; ext: string } {
  if (bytes.length > maxBytes || bytes.length < 12) throw new Error('图片大小或格式无效。')
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: 'image/png', ext: 'png' }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  throw new Error('图片格式无效。')
}
async function imagesDirectory(root: string, id: string, platform: Platform, create: boolean): Promise<string | null> {
  await readDraft(root, id, platform)
  const directory = join(root, id, platform, '图片')
  try { const info = await lstat(directory); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('图片目录无效。') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    if (!create) return null
    try { await mkdir(directory) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('图片目录无效。')
  }
  return directory
}
async function safeRead(file: string): Promise<Buffer> {
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try { const info = await handle.stat(); if (!info.isFile() || info.size > maxBytes) throw new Error('图片文件无效。'); return await handle.readFile() } finally { await handle.close() }
}
export async function listImages(root: string, id: string, platform: Platform): Promise<DraftImage[]> {
  const directory = await imagesDirectory(root, id, platform, false)
  if (!directory) return []
  const files = await readdir(directory, { withFileTypes: true })
  const images: DraftImage[] = []
  for (const file of files.filter((item) => item.isFile() && /\.(png|jpe?g|webp)$/i.test(item.name)).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))) {
    try { const data = await safeRead(join(directory, file.name)); const kind = imageType(data); images.push({ name: file.name, dataUrl: `data:${kind.mime};base64,${data.toString('base64')}` }) } catch { /* Skip unreadable or invalid image files. */ }
  }
  return images
}
export async function saveImage(root: string, id: string, platform: Platform, index: number, bytes: Buffer): Promise<DraftImage> {
  const kind = imageType(bytes)
  const directory = await imagesDirectory(root, id, platform, true)
  if (!directory) throw new Error('图片目录不可用。')
  const existing = await readdir(directory)
  let number = Math.max(0, ...existing.map((name) => Number(/^(\d+)-/.exec(name)?.[1] ?? 0))) + 1
  const temp = join(directory, `.image-${randomUUID()}.tmp`)
  const handle = await open(temp, 'wx', 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.close()
    for (; number < 10000; number++) {
      const name = `${String(number).padStart(2, '0')}-${index === 0 ? '封面' : `配图${index}`}.${kind.ext}`
      try {
        await link(temp, join(directory, name))
        return { name, dataUrl: `data:${kind.mime};base64,${bytes.toString('base64')}` }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    }
  } finally { await handle.close().catch(() => undefined); await rm(temp, { force: true }) }
  throw new Error('图片数量已达上限。')
}
