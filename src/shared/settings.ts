export interface AppSettings {
  apiUrl: string
  model: string
  draftsDirectory: string
  hasApiKey: boolean
  imageService: 'shared' | 'custom'
  imageApiUrl: string
  imageModel: string
  hasImageApiKey: boolean
}
export type KeyChange = { action: 'keep' } | { action: 'replace'; value: string } | { action: 'clear' }
export interface SettingsUpdate {
  apiUrl: string
  model: string
  draftsDirectory: string
  apiKey: KeyChange
  imageService: 'shared' | 'custom'
  imageApiUrl: string
  imageModel: string
  imageApiKey: KeyChange
}
export interface LegacySettings { apiUrl: string; model: string }
export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code?: 'RESEARCH_UNAVAILABLE' }
export interface SettingsApi {
  load: (legacy?: LegacySettings) => Promise<Result<AppSettings>>
  save: (settings: SettingsUpdate) => Promise<Result<AppSettings>>
  chooseDirectory: () => Promise<Result<string | null>>
}
