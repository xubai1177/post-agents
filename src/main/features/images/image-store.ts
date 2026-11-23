import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, link, rm, rmdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { extname, join } from 'node:path'
import { readDraft, safeTitle } from '../drafts/draft-store'
import type { Platform } from '../../../shared/drafts'
import type { DraftImage, ImageDownloadResult } from '../../../shared/images'

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
export function isImageFilename(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 255 &&
    !/[\\/\x00-\x1f]/.test(value) && /\.(png|jpe?g|webp)$/i.test(value)
}
async function imageNames(directory: string): Promise<string[]> {
  const files = await readdir(directory, { withFileTypes: true })
  return files.filter(file => file.isFile() && isImageFilename(file.name))
    .map(file => file.name).sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
}
export async function removeImage(root: string, id: string, platform: Platform, name: string, moveToTrash: (path: string) => Promise<void>): Promise<void> {
  if (!isImageFilename(name)) throw new Error('图片名称无效。')
  const directory = await imagesDirectory(root, id, platform, false)
  if (!directory || !(await imageNames(directory)).includes(name)) throw new Error('找不到这张配图，请重新打开文章。')
  await moveToTrash(join(directory, name))
}
export async function listImages(root: string, id: string, platform: Platform): Promise<DraftImage[]> {
  const directory = await imagesDirectory(root, id, platform, false)
  if (!directory) return []
  const images: DraftImage[] = []
  for (const name of await imageNames(directory)) {
    try { const data = await safeRead(join(directory, name)); const kind = imageType(data); images.push({ name, dataUrl: `data:${kind.mime};base64,${data.toString('base64')}` }) } catch { /* Skip unreadable or invalid image files. */ }
  }
  return images
}

async function copyImage(source: string, target: string): Promise<void> {
  const bytes = await safeRead(source)
  imageType(bytes)
  const output = await open(target, 'wx', 0o600)
  try {
    await output.writeFile(bytes)
    await output.close()
  } catch (error) {
    try { await output.close() } finally { await rm(target, { force: true }) }
    throw error
  }
}

export async function downloadImage(root: string, id: string, platform: Platform, name: string, target: string): Promise<ImageDownloadResult> {
  if (!isImageFilename(name)) throw new Error('图片名称无效。')
  const directory = await imagesDirectory(root, id, platform, false)
  if (!directory || !(await imageNames(directory)).includes(name)) throw new Error('找不到这张配图，请重新打开文章。')
  await copyImage(join(directory, name), target)
  return { saved: 1, failed: 0 }
}

export async function downloadImageToDirectory(root: string, id: string, platform: Platform, name: string, parent: string): Promise<ImageDownloadResult> {
  if (!isImageFilename(name)) throw new Error('图片名称无效。')
  const extension = extname(name)
  const stem = name.slice(0, -extension.length)
  for (let index = 1; index <= 1000; index++) {
    const target = join(parent, index === 1 ? name : `${stem}（${index}）${extension}`)
    try {
      return await downloadImage(root, id, platform, name, target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  throw new Error('图片文件重名过多，请选择其他位置。')
}

async function createDownloadFolder(parent: string, name: string): Promise<string> {
  for (let index = 1; index <= 1000; index++) {
    const folder = join(parent, index === 1 ? name : `${name}（${index}）`)
    try {
      await mkdir(folder)
      return folder
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  throw new Error('配图文件夹重名过多，请选择其他位置。')
}

export async function downloadImages(root: string, id: string, platform: Platform, parent: string): Promise<ImageDownloadResult> {
  const directory = await imagesDirectory(root, id, platform, false)
  const names = directory ? await imageNames(directory) : []
  if (!directory || !names.length) throw new Error('当前平台没有可下载的配图。')
  const destination = await createDownloadFolder(parent, `${safeTitle(id)}-${platform}配图`)
  let saved = 0
  for (const name of names) {
    try {
      await copyImage(join(directory, name), join(destination, name))
      saved++
    } catch { /* Keep the downloaded files and count each failed copy. */ }
  }
  if (saved === 0) await rmdir(destination).catch(() => undefined)
  return { saved, failed: names.length - saved }
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
