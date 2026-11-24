import { platforms } from './drafts'

export interface PlatformLink { name: string; url: string; enabled?: boolean }

export function defaultPlatformLinks(): PlatformLink[] {
  return platforms.map(name => ({ name, url: '' }))
}

export function validPlatformUrl(value: string): boolean {
  if (!value) return true
  if (value.length > 2048) return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}

export function validPlatformLinks(value: unknown): value is PlatformLink[] {
  if (!Array.isArray(value) || value.length > 100 || value.length < platforms.length) return false
  const names = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof item.name !== 'string' || typeof item.url !== 'string' || (item.enabled !== undefined && typeof item.enabled !== 'boolean') ||
      !item.name.trim() || item.name !== item.name.trim() || item.name.length > 50 ||
      /[\x00-\x1f]/.test(item.name) || item.url !== item.url.trim() || !validPlatformUrl(item.url)) return false
    const normalized = item.name.toLocaleLowerCase()
    if (names.has(normalized)) return false
    names.add(normalized)
  }
  return platforms.every(name => value.some(item => item.name === name))
}
