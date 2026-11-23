import { readDraft } from '../drafts/draft-store'
import { saveImage } from './image-store'
import type { ImageGenerationResult, ImageProgress, ImageRequest } from '../../../shared/images'

export async function generateImages(root: string, request: ImageRequest, prompts: string[], generate: (prompt: string) => Promise<Buffer>, onProgress?: (progress: ImageProgress) => void): Promise<ImageGenerationResult> {
  const result: ImageGenerationResult = { images: [], failures: [] }
  for (let index = 0; index < prompts.length; index++) {
    onProgress?.({ phase: 'generating', current: index + 1, total: prompts.length, completed: index })
    try {
      if ((await readDraft(root, request.id, request.platform)).version !== request.version) {
        for (let rest = index; rest < prompts.length; rest++) result.failures.push({ index: rest + 1, error: '文案已变化，请重新读取并生成。' })
        break
      }
      const bytes = await generate(prompts[index])
      if ((await readDraft(root, request.id, request.platform)).version !== request.version) {
        for (let rest = index; rest < prompts.length; rest++) result.failures.push({ index: rest + 1, error: '文案已变化，请重新读取并生成。' })
        break
      }
      result.images.push(await saveImage(root, request.id, request.platform, index, bytes))
    } catch { result.failures.push({ index: index + 1, error: '生成或保存失败，请检查图片模型及服务。' }) }
  }
  return result
}
