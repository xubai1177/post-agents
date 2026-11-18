import { rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createPlatform, createTopic } from '../drafts/draft-store'
import type { CreateRequest, CreateResult, Platform } from '../../../shared/drafts'

type Review = (drafts: Partial<Record<Platform, string>>) => Promise<{ drafts: Partial<Record<Platform, string>>; warnings: string[] }>
export async function generateDrafts(root: string, request: CreateRequest, generate: (platform: Platform) => Promise<string>, review?: Review, onSave?: () => void): Promise<CreateResult> {
  const id = await createTopic(root, request.title)
  const successes: Platform[] = []; const failures: CreateResult['failures'] = []; const drafts: Partial<Record<Platform, string>> = {}
  for (const platform of request.platforms) {
    try { const content = (await generate(platform)).trim(); if (!content) throw new Error('empty output'); drafts[platform] = content }
    catch { failures.push({ platform, error: '生成失败，请检查模型服务。' }) }
  }
  let final = drafts; let warnings: string[] = []
  if (review) { try { const result = await review(drafts); final = result.drafts; warnings = result.warnings } catch { warnings.push('平台差异检查未完成，请人工对照各版本。') } }
  onSave?.()
  for (const platform of request.platforms) {
    const content = final[platform]
    if (!content) continue
    try { await createPlatform(root, id, platform, `${content.trim()}\n`); successes.push(platform) }
    catch { failures.push({ platform, error: '保存失败，请检查草稿目录。' }) }
  }
  if (!successes.length) { try { await rmdir(join(root, id)) } catch { /* Preserve anything that is no longer empty. */ } }
  return { draft: successes.length ? { id, title: id, platforms: successes } : null, failures, warnings }
}
