import { platforms, type Platform } from '../../../shared/drafts'

export type Page = 'detail' | 'settings' | 'topics' | 'platforms'
export interface Route { page: Page; draftId: string; platform: Platform | null }

export function parseRoute(hash: string): Route {
  const [name, query = ''] = hash.replace(/^#/, '').split('?', 2)
  const params = new URLSearchParams(query)
  const platform = params.get('platform')
  return {
    page: name === 'settings' || name === 'topics' || name === 'platforms' ? name : 'detail',
    draftId: params.get('draft') ?? '',
    platform: platforms.find((item) => item === platform) ?? null
  }
}

export function formatRoute(route: Route): string {
  const params = new URLSearchParams()
  if (route.draftId) params.set('draft', route.draftId)
  if (route.draftId && route.platform) params.set('platform', route.platform)
  const query = params.toString()
  return `#${route.page}${query ? `?${query}` : ''}`
}
