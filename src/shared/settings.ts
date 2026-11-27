import type { ImageStyleDefinition, PlatformImageStyles } from './image-styles'
import type { PlatformLink } from './platform-links'
import type { PlatformPrompts } from './platform-prompts'

export const themePresets = [
  { id: 'iris', label: '鸢蓝', color: '#5268d9' },
  { id: 'celadon', label: '青瓷', color: '#146c62' },
  { id: 'slate', label: '雾蓝', color: '#3858a4' },
  { id: 'graphite', label: '石墨', color: '#505961' },
  { id: 'umber', label: '栗棕', color: '#855036' },
] as const
export const defaultAccentColor = themePresets[0].color
export const defaultPanelOpacity = 88
export function isPanelOpacity(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 70 && value <= 100 }

export function themePresetForColor(color: string) {
  return themePresets.find(theme => theme.color === color.toLowerCase())
}
export const appearanceModes = ['system', 'light', 'dark'] as const
export type AppearanceMode = typeof appearanceModes[number]
export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

export interface AppSettings {
  appearance: AppearanceMode
  accentColor: string
  panelOpacity: number
  apiUrl: string
  model: string
  draftsDirectory: string
  hasApiKey: boolean
  imageService: 'shared' | 'custom'
  imageApiUrl: string
  imageModel: string
  hasImageApiKey: boolean
  platformPrompts: PlatformPrompts
  titlePrompts: PlatformPrompts
  platformLinks: PlatformLink[]
  platformImageStyles: PlatformImageStyles
}
export type KeyChange = { action: 'keep' } | { action: 'replace'; value: string } | { action: 'clear' }
export interface SettingsUpdate {
  appearance?: AppearanceMode
  accentColor?: string
  panelOpacity?: number
  apiUrl: string
  model: string
  draftsDirectory: string
  apiKey: KeyChange
  imageService: 'shared' | 'custom'
  imageApiUrl: string
  imageModel: string
  imageApiKey: KeyChange
  platformPrompts?: PlatformPrompts
  titlePrompts?: PlatformPrompts
  platformLinks?: PlatformLink[]
}
export interface LegacySettings { apiUrl: string; model: string }
export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code?: 'RESEARCH_UNAVAILABLE' }
export interface SettingsApi {
  load: (legacy?: LegacySettings) => Promise<Result<AppSettings>>
  save: (settings: SettingsUpdate) => Promise<Result<AppSettings>>
  listModels: (request: { apiUrl: string; service: 'text' | 'image'; apiKey: KeyChange }) => Promise<Result<string[]>>
  chooseDirectory: () => Promise<Result<string | null>>
  savePlatformConfig: (config: { platformLinks: PlatformLink[]; platformPrompts: PlatformPrompts; titlePrompts: PlatformPrompts; platformImageStyles: PlatformImageStyles }) => Promise<Result<AppSettings>>
  saveImageStylePreview: (request: { platform: import('./drafts').Platform; style: ImageStyleDefinition }) => Promise<Result<void>>
  testImageStyle: (request: { platform: import('./drafts').Platform; prompt: string }) => Promise<Result<string>>
  openPlatform: (name: string) => Promise<Result<void>>
}
