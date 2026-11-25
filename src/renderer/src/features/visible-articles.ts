import type { ArticleRun } from '../../../shared/drafts'

/** Keep unfinished generation records out of the article directory. */
export function visibleArticles<T extends { id: string }>(drafts: T[], runs: Pick<ArticleRun, 'id' | 'status'>[]): T[] {
  const unfinished = new Set(runs.filter(run => run.status !== 'done').map(run => run.id))
  return drafts.filter(draft => !unfinished.has(draft.id))
}
