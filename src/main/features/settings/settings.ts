import { app, safeStorage } from 'electron'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AppSettings, LegacySettings, SettingsUpdate } from '../../../shared/settings'

interface StoredSettings { version: 1; apiUrl: string; model: string; draftsDirectory: string; encryptedApiKey: string | null; disableDefaultApiKey?: boolean; imageService?: 'shared' | 'custom'; imageApiUrl?: string; imageModel?: string; encryptedImageApiKey?: string | null }
const empty: StoredSettings = { version: 1, apiUrl: '', model: '', draftsDirectory: '', encryptedApiKey: null }
const selections = new Map<number, string>()
let queue: Promise<unknown> = Promise.resolve()
const path = () => join(app.getPath('userData'), 'settings.json')

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work)
  queue = next.catch(() => undefined)
  return next
}
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
  return data.version === 1 && validModel(value) && validString(data.draftsDirectory, 4096) && (data.encryptedApiKey === null || validString(data.encryptedApiKey, 65536)) && (data.imageService === undefined || data.imageService === 'shared' || data.imageService === 'custom') && (data.imageApiUrl === undefined || validString(data.imageApiUrl, 2048)) && (data.imageModel === undefined || validString(data.imageModel, 512)) && (data.encryptedImageApiKey === undefined || data.encryptedImageApiKey === null || validString(data.encryptedImageApiKey, 65536))
}
export async function readSettings(): Promise<StoredSettings | null> {
  try {
    const data: unknown = JSON.parse(await readFile(path(), 'utf8'))
    if (!validStored(data)) throw new Error('invalid settings')
    return data
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
function publicSettings(data: StoredSettings): AppSettings { return { apiUrl: data.apiUrl || process.env.REVIEW_MODEL_BASE_URL || '', model: data.model || process.env.REVIEW_MODEL_NAME || '', draftsDirectory: data.draftsDirectory, hasApiKey: data.encryptedApiKey !== null || (!data.disableDefaultApiKey && Boolean(process.env.REVIEW_MODEL_API_KEY)), imageService: data.imageService ?? 'shared', imageApiUrl: data.imageApiUrl ?? '', imageModel: data.imageModel || process.env.REVIEW_IMAGE_MODEL || '', hasImageApiKey: Boolean(data.encryptedImageApiKey) } }
export async function getDraftsDirectory(): Promise<string> { return (await readSettings())?.draftsDirectory ?? '' }
export async function getRuntimeSettings(): Promise<{ apiUrl: string; model: string; draftsDirectory: string; apiKey: string }> {
  const data = await readSettings() ?? { ...empty }
  const apiKey = data.encryptedApiKey ? safeStorage.decryptString(Buffer.from(data.encryptedApiKey, 'base64')) : (!data.disableDefaultApiKey ? process.env.REVIEW_MODEL_API_KEY || '' : '')
  return { ...publicSettings(data), apiKey }
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
    const next: StoredSettings = { version: 1, apiUrl: data.apiUrl, model: data.model, draftsDirectory: data.draftsDirectory, encryptedApiKey, disableDefaultApiKey, imageService: data.imageService, imageApiUrl: data.imageApiUrl, imageModel: data.imageModel, encryptedImageApiKey }
    await writeSettings(next)
    selections.delete(senderId)
    return publicSettings(next)
  })
}
