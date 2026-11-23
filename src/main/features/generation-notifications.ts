export type GenerationNotice =
  | { kind: 'topics'; count: number; partial: boolean }
  | { kind: 'article'; count: number; partial: boolean }
  | { kind: 'optimization' }
  | { kind: 'images'; count: number; partial: boolean }

export function generationNoticeText(notice: GenerationNotice): { title: string; body: string } | null {
  if (notice.kind === 'optimization') return { title: '优化候选已生成', body: '请查看候选内容，确认后再应用。' }
  if (notice.count <= 0) return null
  if (notice.kind === 'topics') return { title: notice.partial ? '选题部分完成' : '选题生成完成', body: `已生成 ${notice.count} 个选题，请查看并核查来源。` }
  if (notice.kind === 'article') return { title: notice.partial ? '文章部分完成' : '文章生成完成', body: `已保存 ${notice.count} 个平台版本，请查看并核查内容。` }
  return { title: notice.partial ? '配图部分完成' : '配图生成完成', body: `已保存 ${notice.count} 张图片，请逐张检查。` }
}
