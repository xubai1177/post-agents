import { app, nativeImage } from 'electron'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { join, sep } from 'node:path'
import type { CanvasAsset, LocalBackgroundGroup, LocalBackgroundItem } from '../../../shared/whiteboard'
import { decodeCanvasAsset } from './canvas-assets'
import { isSafeCanvasImage } from './canvas-validation'

const groups: LocalBackgroundGroup[] = ['可爱手帐', '木质纹理']
const validName = /^\d+\.(?:png|jpe?g|webp)$/i
const root = () => join(app.getAppPath(), 'artifacts', 'whiteboard-backgrounds')
async function filePath(group: unknown, filename: unknown): Promise<string> {
  if (typeof group !== 'string' || !groups.includes(group as LocalBackgroundGroup) || typeof filename !== 'string' || !validName.test(filename)) throw new Error('背景素材无效。')
  const folder = join(root(), group), resolvedRoot = await realpath(root()), resolvedFolder = await realpath(folder)
  if (resolvedFolder !== join(resolvedRoot, group)) throw new Error('背景素材目录无效。')
  const path = join(resolvedFolder, filename), stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 15 * 1024 * 1024 || !(await realpath(path)).startsWith(resolvedFolder + sep)) throw new Error('背景图片无效或超过 15 MB。')
  return path
}
export async function listLocalBackgrounds(): Promise<LocalBackgroundItem[]> {
  if (app.isPackaged) return []
  const result: LocalBackgroundItem[] = []
  for (const group of groups) {
    let filenames: string[]
    try { filenames = await readdir(join(root(), group)) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error }
    let names = new Map<string, string>()
    try {
      const manifest = JSON.parse(await readFile(join(root(), group, '素材清单.json'), 'utf8')) as { items?: { file?: unknown; title?: unknown }[] }
      if (Array.isArray(manifest.items)) names = new Map(manifest.items.filter(item => typeof item.file === 'string' && typeof item.title === 'string').map(item => [String(item.file), String(item.title).slice(0, 100)]))
    } catch { /* A missing or invalid optional label file does not prevent loading images. */ }
    for (const filename of filenames.filter(name => validName.test(name)).sort()) {
      try {
        const bytes = await readFile(await filePath(group, filename))
        if (!isSafeCanvasImage(bytes)) continue
        const image = nativeImage.createFromBuffer(bytes), size = image.getSize()
        if (image.isEmpty() || size.width > 4096 || size.height > 4096 || size.width * size.height > 16000000) continue
        const thumbnail = image.resize({ width: 140, height: 100, quality: 'good' }).toDataURL()
        result.push({ group, filename, name: names.get(filename) || filename, thumbnail })
      } catch { /* Keep other successfully read images available. */ }
    }
  }
  return result
}
export async function readLocalBackground(group: unknown, filename: unknown): Promise<CanvasAsset> {
  const path = await filePath(group, filename)
  return decodeCanvasAsset(await readFile(path), String(filename))
}
