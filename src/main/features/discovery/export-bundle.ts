import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { safeTitle } from '../drafts/draft-store'

type ExportImage = { name: string; read: () => Promise<{ bytes: Buffer; ext: string } | null> }
interface Bundle { title: string; content: string; images: ExportImage[] }
export interface BundleResult { folder: string; savedImages: number; failedImages: number }

export async function exportBundle(parent: string, bundle: Bundle): Promise<BundleResult> {
  let base: string
  try { base = safeTitle(bundle.title) } catch { base = '帖子' }
  let folder = ''
  for (let i = 1; i <= 1000; i++) {
    const name = `${base}${i === 1 ? '' : `（${i}）`}`
    try { await mkdir(join(parent, name)); folder = name; break }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  }
  if (!folder) throw new Error('发现操作：同名文件夹过多，请选择其他位置。')
  const path = join(parent, folder)
  try { await writeFile(join(path, '内容.md'), bundle.content, { flag: 'wx', mode: 0o600 }) }
  catch { throw new Error(`发现操作：文件夹“${folder}”已创建，但正文保存失败，请检查保存位置。`) }
  let savedImages = 0, failedImages = 0
  for (const entry of bundle.images) {
    try {
      const result = await entry.read()
      if (!result || !['png', 'jpg', 'webp', 'gif', 'avif'].includes(result.ext) || !/^[\w\u4e00-\u9fff-]+$/.test(entry.name)) throw new Error('invalid image')
      await writeFile(join(path, `${entry.name}.${result.ext}`), result.bytes, { flag: 'wx', mode: 0o600 })
      savedImages++
    } catch { failedImages++ }
  }
  return { folder, savedImages, failedImages }
}

export async function exportOriginalPost(parent: string, post: { id: string; title: string; author: string; content: string; imageCount: number }, read: (id: string, index: number) => Promise<string | null>): Promise<BundleResult> {
  const images = Array.from({ length: post.imageCount }, (_, index) => ({
    name: `图片${String(index + 1).padStart(2, '0')}`,
    read: async () => {
      const value = await read(post.id, index)
      const match = /^data:image\/(png|jpeg|webp|gif|avif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value ?? '')
      if (!match) return null
      return { bytes: Buffer.from(match[2], 'base64'), ext: match[1] === 'jpeg' ? 'jpg' : match[1] }
    }
  }))
  return exportBundle(parent, { title: post.title, content: `# ${post.title.replace(/[\r\n]/g, ' ')}\n\n作者：${post.author.replace(/[\r\n]/g, ' ')}\n\n来源：https://www.xiaohongshu.com/explore/${post.id}\n\n${post.content}\n`, images })
}
