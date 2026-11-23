import { rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createPlatform, createTopic, saveDraft, saveDraftWithTitle } from '../drafts/draft-store'
import type { CreateRequest, CreateResult, Platform } from '../../../shared/drafts'

type Review = (drafts: Partial<Record<Platform, string>>) => Promise<{ drafts: Partial<Record<Platform, string>>; warnings: string[] }>
export async function generateDrafts(root: string, request: CreateRequest, generate: (platform: Platform) => Promise<string>, review?: Review, onSave?: () => void, existing?: { id: string; versions: Partial<Record<Platform, string>>; expectedTitle?: string | null }, allowEmpty = false): Promise<CreateResult> {
  const id = existing?.id ?? await createTopic(root, request.title)
  const successes: Platform[] = []; const failures: CreateResult['failures'] = []; const drafts: Partial<Record<Platform, string>> = {}
  for (const platform of request.platforms) {
    try { const content = (await generate(platform)).trim(); if (!content && !allowEmpty) throw new Error('empty output'); drafts[platform] = content }
    catch { failures.push({ platform, error: '生成失败，请检查模型服务。' }) }
  }
  let final = drafts; let warnings: string[] = []
  if (review) { try { const result = await review(drafts); final = result.drafts; warnings = result.warnings } catch { warnings.push('内容检查未完成，保留原文，请人工检查。') } }
  onSave?.()
  for (const platform of request.platforms) {
    const content = final[platform]
    if (content === undefined || (!content && !allowEmpty)) continue
    try {
      if (existing) {
        const version = existing.versions[platform]
        if (!version) throw new Error('缺少原始版本。')
        if ('expectedTitle' in existing) await saveDraftWithTitle(root, id, platform, `${content.trim()}\n`, version, existing.expectedTitle ?? null)
        else await saveDraft(root, id, platform, `${content.trim()}\n`, version)
      } else await createPlatform(root, id, platform, `${content.trim()}\n`)
      successes.push(platform)
    } catch { failures.push({ platform, error: existing ? '文章已修改或保存失败，请检查后重试。' : '保存失败，请检查草稿目录。' }) }
  }
  if (!successes.length && !existing) { try { await rmdir(join(root, id)) } catch { /* Preserve anything that is no longer empty. */ } }
  return { draft: successes.length ? { id, title: id, platforms: successes } : null, failures, warnings }
}
