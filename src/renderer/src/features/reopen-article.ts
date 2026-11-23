import { platforms, type Draft, type DraftsApi } from '../../../shared/drafts'
import type { OpenDocument } from './types'

type Documents = Record<string, OpenDocument>
export async function prepareArticleOpen(sourceId: string, target: Draft, io: {
  getDocuments: () => Documents
  updateDocuments: (update: (current: Documents) => Documents) => void
  save: DraftsApi['save']
  read: DraftsApi['read']
  isLocked?: (key: string) => boolean
}): Promise<void> {
  const ids = new Set([sourceId, target.id].filter(Boolean))
  for (const id of ids) for (const platform of platforms) {
    const key = `${id}:${platform}`
    if (io.isLocked?.(key)) continue
    for (let attempt = 0; attempt < 2; attempt++) {
      const doc = io.getDocuments()[key]
      if (!doc || doc.content === doc.savedContent) break
      const snapshot = doc.content
      const result = await io.save(id, platform, snapshot, doc.version)
      if (!result.ok) throw new Error(`保存未完成，未重新读取：${result.error}`)
      io.updateDocuments((all) => { const latest = all[key]; return latest ? { ...all, [key]: { ...latest, savedContent: snapshot, version: result.value.version } } : all })
    }
    const latest = io.getDocuments()[key]
    if (latest && latest.content !== latest.savedContent) throw new Error('文章仍有未保存的修改，请保存后重试。')
  }
  const beforeReads = io.getDocuments()
  const reads = await Promise.all(target.platforms.filter(platform => !io.isLocked?.(`${target.id}:${platform}`)).map(async (platform) => ({ platform, result: await io.read(target.id, platform) })))
  const failed = reads.find((item) => !item.result.ok)
  if (failed && !failed.result.ok) throw new Error(`无法重新读取文章：${failed.result.error}`)
  if ([...ids].some((id) => platforms.some((platform) => { const doc = io.getDocuments()[`${id}:${platform}`]; return doc && doc.content !== doc.savedContent }))) throw new Error('文章已发生新的修改，未重新读取。')
  io.updateDocuments((all) => { const next = { ...all }; for (const { platform, result } of reads) if (result.ok && !io.isLocked?.(`${target.id}:${platform}`) && next[`${target.id}:${platform}`] === beforeReads[`${target.id}:${platform}`]) next[`${target.id}:${platform}`] = { ...result.value, savedContent: result.value.content }; return next })
}
