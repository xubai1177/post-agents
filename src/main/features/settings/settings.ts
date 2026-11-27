import { defaultPlatformImageStyles, imageStyleDefaultsVersion, isPlatformImageStyles, replacePlatformStylePreview, upgradeLegacyPlatformImageStyles, type PlatformImageStyles } from '../../../shared/image-styles'
import { platforms, type Platform } from '../../../shared/drafts'
import { rememberWorkspace } from '../../../shared/recent-workspaces'
import { defaultPlatformLinks, fillDefaultPlatformLinks, validPlatformLinks, type PlatformLink } from '../../../shared/platform-links'
import { app, safeStorage } from 'electron'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { compactPlatformPrompts, isPlatformPrompts, resolvePlatformPrompts, resolveTitlePrompts, type PlatformPrompts } from '../../../shared/platform-prompts'
import { defaultAccentColor, defaultPanelOpacity, isAppearanceMode, isPanelOpacity, type AppearanceMode, type AppSettings, type LegacySettings, type SettingsUpdate } from '../../../shared/settings'

interface StoredSettings { imageStyleDefaultsVersion?: 1 | 2; platformImageStyles?: PlatformImageStyles; platformLinkDefaultsApplied?: boolean; recentWorkspaces?: string[]; appearance?: AppearanceMode; accentColor?: string; panelOpacity?: number; version: 1; apiUrl: string; model: string; draftsDirectory: string; encryptedApiKey: string | null; disableDefaultApiKey?: boolean; imageService?: 'shared' | 'custom'; imageApiUrl?: string; imageModel?: string; encryptedImageApiKey?: string | null; platformPrompts?: PlatformPrompts; titlePrompts?: PlatformPrompts; platformLinks?: PlatformLink[] }
const empty: StoredSettings = { version: 1, apiUrl: '', model: '', draftsDirectory: '', encryptedApiKey: null }
const selections = new Map<number, string>()
let queue: Promise<unknown> = Promise.resolve()
const path = () => join(app.getPath('userData'), 'settings.json')

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work)
  queue = next.catch(() => undefined)
  return next
}
function isPlatform(value: unknown): value is Platform { return typeof value === 'string' && platforms.some(item => item === value) }
function validString(value: unknown, max: number): value is string { return typeof value === 'string' && value.length <= max && !value.includes('\0') }
function validModel(value: unknown): value is LegacySettings {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  if (!validString(data.apiUrl, 2048) || !validString(data.model, 512)) return false
  if (data.apiUrl) { try { const parsed = new URL(data.apiUrl); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return false } catch { return false } }
  return true
}
function validStored(value: unknown): value is StoredSettings {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return (data.imageStyleDefaultsVersion === undefined || data.imageStyleDefaultsVersion === 1 || data.imageStyleDefaultsVersion === imageStyleDefaultsVersion) && (data.platformImageStyles === undefined || isPlatformImageStyles(data.platformImageStyles)) && (data.recentWorkspaces === undefined || (Array.isArray(data.recentWorkspaces) && data.recentWorkspaces.every((directory: unknown) => validString(directory, 4096) && directory.length > 0))) && (data.appearance === undefined || isAppearanceMode(data.appearance)) && (data.panelOpacity === undefined || isPanelOpacity(data.panelOpacity)) && (data.accentColor === undefined || (typeof data.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(data.accentColor))) && data.version === 1 && validModel(value) && validString(data.draftsDirectory, 4096) && (data.encryptedApiKey === null || validString(data.encryptedApiKey, 65536)) && (data.imageService === undefined || data.imageService === 'shared' || data.imageService === 'custom') && (data.imageApiUrl === undefined || validString(data.imageApiUrl, 2048)) && (data.imageModel === undefined || validString(data.imageModel, 512)) && (data.encryptedImageApiKey === undefined || data.encryptedImageApiKey === null || validString(data.encryptedImageApiKey, 65536)) && (data.platformPrompts === undefined || isPlatformPrompts(data.platformPrompts)) && (data.titlePrompts === undefined || isPlatformPrompts(data.titlePrompts)) && (data.platformLinks === undefined || validPlatformLinks(data.platformLinks))
}
export async function readSettings(): Promise<StoredSettings | null> {
  try {
    const data: unknown = JSON.parse(await readFile(path(), 'utf8'))
    if (!validStored(data)) throw new Error('invalid settings')
    return data.imageStyleDefaultsVersion === imageStyleDefaultsVersion ? data : { ...data, imageStyleDefaultsVersion, ...(data.platformImageStyles && { platformImageStyles: upgradeLegacyPlatformImageStyles(data.platformImageStyles) }) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new Error('无法读取已保存的设置，请检查配置文件。')
  }
}
async function writeSettings(data: StoredSettings): Promise<void> {
  const directory = app.getPath('userData')
  await mkdir(directory, { recursive: true })
  const temporary = join(directory, `.settings-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' })
    await rename(temporary, path())
  } finally { await rm(temporary, { force: true }) }
}
function publicSettings(data: StoredSettings): AppSettings { return { appearance: data.appearance ?? 'system', accentColor: data.accentColor ?? defaultAccentColor, panelOpacity: data.panelOpacity ?? defaultPanelOpacity, apiUrl: data.apiUrl || process.env.REVIEW_MODEL_BASE_URL || '', model: data.model || process.env.REVIEW_MODEL_NAME || '', draftsDirectory: data.draftsDirectory, hasApiKey: data.encryptedApiKey !== null || (!data.disableDefaultApiKey && Boolean(process.env.REVIEW_MODEL_API_KEY)), imageService: data.imageService ?? 'shared', imageApiUrl: data.imageApiUrl ?? '', imageModel: data.imageModel || process.env.REVIEW_IMAGE_MODEL || '', hasImageApiKey: Boolean(data.encryptedImageApiKey), platformPrompts: resolvePlatformPrompts(data.platformPrompts), titlePrompts: resolveTitlePrompts(data.titlePrompts), platformLinks: data.platformLinks ?? defaultPlatformLinks(), platformImageStyles: data.platformImageStyles ?? defaultPlatformImageStyles() } }
export async function getDraftsDirectory(): Promise<string> { return (await readSettings())?.draftsDirectory ?? '' }
export async function getRuntimeSettings(): Promise<{ apiUrl: string; model: string; draftsDirectory: string; apiKey: string; platformPrompts: PlatformPrompts; titlePrompts: PlatformPrompts; platformImageStyles: PlatformImageStyles }> {
  const data = await readSettings() ?? { ...empty }
  const apiKey = data.encryptedApiKey ? safeStorage.decryptString(Buffer.from(data.encryptedApiKey, 'base64')) : (!data.disableDefaultApiKey ? process.env.REVIEW_MODEL_API_KEY || '' : '')
  return { ...publicSettings(data), apiKey }
}
export async function getCustomImageApiKey(): Promise<string> {
  const data = await readSettings() ?? { ...empty }
  return data.encryptedImageApiKey ? safeStorage.decryptString(Buffer.from(data.encryptedImageApiKey, 'base64')) : ''
}
export async function getImageSettings(): Promise<{ apiUrl: string; model: string; apiKey: string; draftsDirectory: string }> {
  const data = await readSettings() ?? { ...empty }
  const text = await getRuntimeSettings()
  const custom = data.imageService === 'custom'
  return { apiUrl: custom ? data.imageApiUrl ?? '' : text.apiUrl, model: data.imageModel || process.env.REVIEW_IMAGE_MODEL || '', apiKey: custom ? (data.encryptedImageApiKey ? safeStorage.decryptString(Buffer.from(data.encryptedImageApiKey, 'base64')) : '') : text.apiKey, draftsDirectory: data.draftsDirectory }
}
export function loadSettings(legacy: unknown): Promise<AppSettings> {
  return serialize(async () => {
    let current = await readSettings()
    if (!current && validModel(legacy) && (legacy.apiUrl || legacy.model)) {
      current = { ...empty, apiUrl: legacy.apiUrl, model: legacy.model }
    }
    if (current && !current.platformLinkDefaultsApplied) {
      current = { ...current, platformLinks: fillDefaultPlatformLinks(current.platformLinks ?? defaultPlatformLinks()), platformLinkDefaultsApplied: true }
      await writeSettings(current)
    }
    return publicSettings(current ?? empty)
  })
}

export function recordDirectorySelection(senderId: number, selected: string): void { selections.set(senderId, selected) }

export function saveSettings(senderId: number, update: unknown): Promise<AppSettings> {
  return serialize(async () => {
    if (!validModel(update) || !update || typeof update !== 'object') throw new Error('invalid input')
    const data = update as SettingsUpdate
    if (!validString(data.draftsDirectory, 4096) || !data.apiKey || !['keep', 'replace', 'clear'].includes(data.apiKey.action)) throw new Error('invalid input')
    if (!['shared', 'custom'].includes(data.imageService) || !validModel({ apiUrl: data.imageApiUrl, model: data.imageModel }) || !data.imageApiKey || !['keep', 'replace', 'clear'].includes(data.imageApiKey.action)) throw new Error('invalid image settings')
    if (data.platformPrompts !== undefined && !isPlatformPrompts(data.platformPrompts)) throw new Error('invalid platform prompts')
    if (data.platformLinks !== undefined && !validPlatformLinks(data.platformLinks)) throw new Error('invalid platform links')
    if (data.titlePrompts !== undefined && !isPlatformPrompts(data.titlePrompts)) throw new Error('invalid title prompts')
    if (data.appearance !== undefined && !isAppearanceMode(data.appearance)) throw new Error('invalid appearance')
    if (data.panelOpacity !== undefined && !isPanelOpacity(data.panelOpacity)) throw new Error('invalid panel opacity')
    if (data.accentColor !== undefined && !/^#[0-9a-f]{6}$/i.test(data.accentColor)) throw new Error('invalid accent')
    const existing = await readSettings() ?? { ...empty }
    if (data.draftsDirectory && data.draftsDirectory !== existing.draftsDirectory) {
      if (selections.get(senderId) !== data.draftsDirectory || !(await stat(data.draftsDirectory)).isDirectory()) throw new Error('invalid directory')
    }
    let encryptedApiKey = existing.encryptedApiKey
    let disableDefaultApiKey = existing.disableDefaultApiKey ?? false
    if (data.apiKey.action === 'clear') { encryptedApiKey = null; disableDefaultApiKey = true }
    if (data.apiKey.action === 'replace') {
      if (!validString(data.apiKey.value, 8192) || !data.apiKey.value.trim()) throw new Error('invalid key')
      if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && ['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend()))) throw new Error('此设备的安全存储不可用，无法保存 API 密钥。')
      encryptedApiKey = safeStorage.encryptString(data.apiKey.value).toString('base64')
      disableDefaultApiKey = false
    }
    let encryptedImageApiKey = existing.encryptedImageApiKey ?? null
    if (data.imageApiKey.action === 'clear') encryptedImageApiKey = null
    if (data.imageApiKey.action === 'replace') {
      if (!validString(data.imageApiKey.value, 8192) || !data.imageApiKey.value.trim()) throw new Error('invalid key')
      if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && ['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend()))) throw new Error('此设备的安全存储不可用，无法保存 API 密钥。')
      encryptedImageApiKey = safeStorage.encryptString(data.imageApiKey.value).toString('base64')
    }
    const next: StoredSettings = { platformLinkDefaultsApplied: true, version: 1, recentWorkspaces: rememberWorkspace(existing.recentWorkspaces ?? [], data.draftsDirectory), appearance: data.appearance ?? existing.appearance, accentColor: data.accentColor ?? existing.accentColor, panelOpacity: data.panelOpacity ?? existing.panelOpacity, apiUrl: data.apiUrl, model: data.model, draftsDirectory: data.draftsDirectory, encryptedApiKey, disableDefaultApiKey, imageService: data.imageService, imageApiUrl: data.imageApiUrl, imageModel: data.imageModel, encryptedImageApiKey, platformPrompts: data.platformPrompts === undefined ? existing.platformPrompts : compactPlatformPrompts(data.platformPrompts), titlePrompts: data.titlePrompts === undefined ? existing.titlePrompts : data.titlePrompts, platformLinks: data.platformLinks ?? existing.platformLinks, platformImageStyles: existing.platformImageStyles, imageStyleDefaultsVersion }
    await writeSettings(next)
    selections.delete(senderId)
    return publicSettings(next)
  })
}

export function savePlatformConfig(input: unknown): Promise<AppSettings> {
  return serialize(async () => {
    if (!input || typeof input !== 'object') throw new Error('invalid platform configuration')
    const data = input as Record<string, unknown>
    if (!validPlatformLinks(data.platformLinks) || !isPlatformPrompts(data.platformPrompts) || !isPlatformPrompts(data.titlePrompts) || !isPlatformImageStyles(data.platformImageStyles)) throw new Error('invalid platform configuration')
    const existing = await readSettings() ?? { ...empty }
    const next = { ...existing, imageStyleDefaultsVersion, platformLinkDefaultsApplied: true, platformLinks: data.platformLinks, platformPrompts: compactPlatformPrompts(data.platformPrompts), titlePrompts: data.titlePrompts, platformImageStyles: data.platformImageStyles }
    await writeSettings(next)
    return publicSettings(next)
  })
}

export function saveImageStylePreview(input: unknown): Promise<void> {
  return serialize(async () => {
    if (!input || typeof input !== 'object' || !('platform' in input) || !isPlatform(input.platform) || !('style' in input) || !input.style || typeof input.style !== 'object') throw new Error('图片风格预览：请求无效。')
    const candidate = input.style as Record<string, unknown>
    if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || typeof candidate.prompt !== 'string' || typeof candidate.preview !== 'string') throw new Error('图片风格预览：请填写风格名称和提示词后重试。')
    const existing = await readSettings() ?? { ...empty }
    let platformImageStyles: PlatformImageStyles
    try {
      platformImageStyles = replacePlatformStylePreview(existing.platformImageStyles ?? defaultPlatformImageStyles(), input.platform, { id: candidate.id, name: candidate.name, prompt: candidate.prompt, preview: candidate.preview })
    } catch (error) { throw new Error(`图片风格预览：${error instanceof Error ? error.message : '保存失败。'}`) }
    await writeSettings({ ...existing, imageStyleDefaultsVersion, platformImageStyles })
  })
}

// Backup credentials leave safe storage only inside the main process, immediately before encryption.
export async function settingsForBackup(includeCredentials = true): Promise<import('../workspace/backup').BackupSettings> {
  const data = await readSettings() ?? { ...empty }
  const runtime = includeCredentials ? await getRuntimeSettings() : { ...publicSettings(data), apiKey: '' }
  const imageApiKey = includeCredentials && data.encryptedImageApiKey ? safeStorage.decryptString(Buffer.from(data.encryptedImageApiKey, 'base64')) : ''
  return { apiUrl: runtime.apiUrl, model: runtime.model, apiKey: runtime.apiKey, imageService: data.imageService ?? 'shared', imageApiUrl: data.imageApiUrl ?? '', imageModel: data.imageModel || process.env.REVIEW_IMAGE_MODEL || '', imageApiKey, platformPrompts: data.platformPrompts, titlePrompts: data.titlePrompts, platformImageStyles: data.platformImageStyles, imageStyleDefaultsVersion }
}
export async function listWorkspaces(): Promise<{ current: string; recent: string[] }> {
  const current = await readSettings() ?? { ...empty }
  return { current: current.draftsDirectory, recent: rememberWorkspace(current.recentWorkspaces ?? [], current.draftsDirectory) }
}
export function switchWorkspace(directory: string, requireKnown = false): Promise<AppSettings> {
  return serialize(async () => {
    const current = await readSettings() ?? { ...empty }
    if (requireKnown && !rememberWorkspace(current.recentWorkspaces ?? [], current.draftsDirectory).includes(directory)) throw new Error('工作区操作：该工作区不在列表中，请重新打开。')
    try { if (!(await stat(directory)).isDirectory()) throw new Error() } catch { throw new Error('工作区操作：找不到工作区目录，请检查目录是否已移动。') }
    const next = { ...current, draftsDirectory: directory, recentWorkspaces: rememberWorkspace(rememberWorkspace(current.recentWorkspaces ?? [], current.draftsDirectory), directory) }
    await writeSettings(next); return publicSettings(next)
  })
}
export function restoreWorkspaceSettings(directory: string, backup: import('../workspace/backup').BackupSettings): Promise<AppSettings> {
  return serialize(async () => {
    if ((backup.imageStyleDefaultsVersion !== undefined && backup.imageStyleDefaultsVersion !== 1 && backup.imageStyleDefaultsVersion !== imageStyleDefaultsVersion) || (backup.platformImageStyles !== undefined && !isPlatformImageStyles(backup.platformImageStyles)) || (backup.titlePrompts !== undefined && !isPlatformPrompts(backup.titlePrompts)) || (backup.platformPrompts !== undefined && !isPlatformPrompts(backup.platformPrompts)) || !validModel(backup) || !validModel({ apiUrl: backup.imageApiUrl, model: backup.imageModel }) || !validString(backup.apiKey, 8192) || !validString(backup.imageApiKey, 8192) || !['shared', 'custom'].includes(backup.imageService)) throw new Error('备份设置无效。')
    if (backup.credentialsIncluded !== false && (backup.apiKey || backup.imageApiKey) && (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && ['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend())))) throw new Error('此设备的安全存储不可用，无法恢复 API 密钥。')
    const current = await readSettings() ?? { ...empty }
    const data: StoredSettings = { platformLinkDefaultsApplied: current.platformLinkDefaultsApplied, version: 1, recentWorkspaces: rememberWorkspace(rememberWorkspace(current.recentWorkspaces ?? [], current.draftsDirectory), directory), appearance: current.appearance, accentColor: current.accentColor, panelOpacity: current.panelOpacity, draftsDirectory: directory, apiUrl: backup.apiUrl, model: backup.model, encryptedApiKey: backup.credentialsIncluded === false ? current.encryptedApiKey : backup.apiKey ? safeStorage.encryptString(backup.apiKey).toString('base64') : null, disableDefaultApiKey: backup.credentialsIncluded === false ? current.disableDefaultApiKey : !backup.apiKey, imageService: backup.imageService, imageApiUrl: backup.imageApiUrl, imageModel: backup.imageModel, encryptedImageApiKey: backup.credentialsIncluded === false ? current.encryptedImageApiKey : backup.imageApiKey ? safeStorage.encryptString(backup.imageApiKey).toString('base64') : null, platformPrompts: backup.platformPrompts, titlePrompts: backup.titlePrompts, platformLinks: current.platformLinks, platformImageStyles: backup.platformImageStyles ? (backup.imageStyleDefaultsVersion === imageStyleDefaultsVersion ? backup.platformImageStyles : upgradeLegacyPlatformImageStyles(backup.platformImageStyles)) : current.platformImageStyles, imageStyleDefaultsVersion }
    await writeSettings(data); return publicSettings(data)
  })
}
