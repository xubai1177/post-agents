import { randomUUID } from 'node:crypto'
import { imageType } from '../images/image-store'

interface Input { id: string; index: number; title: string; content: string }
interface Dependencies {
  readImage: (id: string, index: number) => Promise<string | null>
  describe: (image: string) => Promise<string>
  generate: (prompt: string) => Promise<Buffer>
}
let preview: (Input & { token: string; bytes: Buffer }) | null = null
let standalone: { id: string; index: number; token: string; bytes: Buffer } | null = null

async function createReference(input: { id: string; index: number }, deps: Dependencies, content: string): Promise<Buffer> {
  const reference = await deps.readImage(input.id, input.index)
  if (!reference) throw new Error('发现操作：参考图片加载失败，请换一张图片重试。')
  let description: string
  try { description = (await deps.describe(reference)).trim() } catch { throw new Error('发现操作：无法识别参考图片，请检查文案模型是否支持图片理解。') }
  if (!description || description.length > 5000) throw new Error('发现操作：参考图片识别结果无效，请重试。')
  let bytes: Buffer
  try {
    bytes = await deps.generate(`创作一张适合小红书的原创配图。参考图的视觉描述仅作灵感，重新设计布局和视觉元素，不照搬原图或标志。保留可辨认的核心信息，不虚构事实，不冒充真实截图或官方标识。参考描述：\n${description}\n\n${content}`)
    imageType(bytes)
  } catch { throw new Error('发现操作：生成图片失败，请检查图片模型配置后重试。') }
  return bytes
}
export async function generateReferenceImage(input: Input, deps: Dependencies): Promise<{ token: string; dataUrl: string }> {
  const bytes = await createReference(input, deps, `以以下改写后的文章为内容依据，画面中的文字应简洁且与文案一致。\n标题：${input.title}\n文案：\n${input.content.slice(0, 25000)}`)
  const token = randomUUID()
  preview = { ...input, token, bytes }
  const kind = imageType(bytes)
  return { token, dataUrl: `data:${kind.mime};base64,${bytes.toString('base64')}` }
}

export async function rewriteImage(input: { id: string; index: number }, deps: Dependencies): Promise<{ token: string; dataUrl: string }> {
  const bytes = await createReference(input, deps, '只依据参考图的描述生成图片，不使用帖子正文或改写文案。文字不清楚时不要臆造。')
  const token = randomUUID(); standalone = { ...input, token, bytes }
  return { token, dataUrl: `data:${imageType(bytes).mime};base64,${bytes.toString('base64')}` }
}
export function standaloneImage(token: string, id: string): Buffer {
  if (!standalone || standalone.token !== token || standalone.id !== id) throw new Error('发现操作：图片候选已失效，请重新生成。')
  return standalone.bytes
}

export function referenceImageForSave(token: string, input: Pick<Input, 'id' | 'title' | 'content'>): Buffer {
  if (!preview || preview.token !== token || preview.id !== input.id || preview.title !== input.title || preview.content !== input.content) throw new Error('发现操作：文案或图片候选已变化，请重新生成图片。')
  return preview.bytes
}
export function clearReferenceImage(token: string): void { if (preview?.token === token) preview = null }

export async function downloadStandaloneImage(directory: string, token: string, id: string): Promise<string> {
  const { open, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const bytes = standaloneImage(token, id), ext = imageType(bytes).ext
  for (let index = 1; index <= 1000; index++) {
    const name = `改写图片${index === 1 ? '' : `（${index}）`}.${ext}`
    const path = join(directory, name)
    try {
      const file = await open(path, 'wx', 0o600)
      try { await file.writeFile(bytes) } catch (error) { await file.close(); await rm(path, { force: true }); throw error }
      await file.close()
      return name
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  }
  throw new Error('发现操作：同名图片过多，请选择其他位置。')
}
