import type { Draft, DraftsApi } from '../../../shared/drafts'
import type { ImagesApi, ImageProgress, ImageRequest } from '../../../shared/images'
import type { ImageStyle, PlatformStyleSelections } from '../../../shared/image-styles'

export async function generateCreatedArticleImages(draft: Pick<Draft, 'id' | 'platforms'>, style: ImageStyle, io: { read: DraftsApi['read']; generate: (request: ImageRequest, onProgress: (progress: ImageProgress) => void) => ReturnType<ImagesApi['generate']>; onProgress: (message: string) => void; onComplete?: (count: number, partial: boolean) => void; imageStylesByPlatform?: PlatformStyleSelections }): Promise<string[]> {
  const messages: string[] = []
  let saved = 0, partial = false
  for (const platform of draft.platforms) {
    io.onProgress(`正在为${platform}生成配图…`)
    try {
      const document = await io.read(draft.id, platform)
      if (!document.ok) { partial = true; messages.push(`${platform}配图未生成：${document.error}`); continue }
      const result = await io.generate({ id: draft.id, platform, version: document.value.version, style: io.imageStylesByPlatform?.[platform] ?? style }, progress => {
        io.onProgress(progress.phase === 'planning' ? `${platform}：正在策划配图` : `${platform}：正在生成第 ${progress.current} / ${progress.total} 张，已处理 ${progress.completed} 张`)
      })
      if (!result.ok) { partial = true; messages.push(`${platform}配图未生成：${result.error}`); continue }
      saved += result.value.images.length
      if (result.value.failures.length || result.value.images.length === 0) partial = true
      const failures = result.value.failures.map((item) => `第 ${item.index} 张：${item.error}`).join('；')
      messages.push(failures ? `${platform}已保存 ${result.value.images.length} 张；${failures}` : `${platform}已保存 ${result.value.images.length} 张图片。`)
    } catch { partial = true; messages.push(`${platform}配图生成失败，请检查图片服务。`) }
  }
  io.onComplete?.(saved, partial)
  return messages
}
