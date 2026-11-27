import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isIP } from 'node:net'
import type { CloudVoiceProvider, VoiceConfig, VoiceConfigInput } from '../../../shared/whiteboard'

const defaults: Record<CloudVoiceProvider, string> = { volcengine: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional', 'agent-plan': 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional' }
type Stored = Omit<VoiceConfig, 'hasKey'> & { encryptedKey: string }
let queue: Promise<unknown> = Promise.resolve()
function locked<T>(work: () => Promise<T>): Promise<T> { const result = queue.then(work, work); queue = result.catch(() => {}); return result }
const path = () => join(app.getPath('userData'), 'whiteboard-voice-configs.json')
async function write(items: Stored[]): Promise<void> {
  const dir = app.getPath('userData'), temp = join(dir, `.voice-config-${randomUUID()}.tmp`)
  await mkdir(dir, { recursive: true })
  try { await writeFile(temp, JSON.stringify(items), { flag: 'wx', mode: 0o600 }); await rename(temp, path()) } finally { await rm(temp, { force: true }) }
}
async function read(): Promise<Stored[]> {
  try {
    const data: unknown = JSON.parse(await readFile(path(), 'utf8'))
    if (!Array.isArray(data) || !data.every(item => item && typeof item.id === 'string' && typeof item.name === 'string' && (item.provider === 'volcengine' || item.provider === 'agent-plan') && typeof item.url === 'string' && typeof item.encryptedKey === 'string')) throw new Error('invalid')
    return data as Stored[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('白板视频：无法读取语音配置，请检查配置文件。')
  }
  const migrated: Stored[] = []
  for (const provider of ['volcengine', 'agent-plan'] as const) {
    try { const key = await readFile(join(app.getPath('userData'), provider === 'volcengine' ? 'whiteboard-voice-key' : 'whiteboard-agent-plan-voice-key')); if (key.length) migrated.push({ id: randomUUID(), name: provider === 'volcengine' ? '火山引擎语音 2.0' : '火山 Agent Plan 语音', provider, url: defaults[provider], encryptedKey: key.toString('base64') }) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('白板视频：无法读取旧语音密钥。') }
  }
  await write(migrated)
  return migrated
}
function publicConfig(item: Stored): VoiceConfig { return { id: item.id, name: item.name, provider: item.provider, url: item.url, hasKey: !!item.encryptedKey } }
export function listVoiceConfigs(): Promise<VoiceConfig[]> { return locked(async () => (await read()).map(publicConfig)) }
function validUrl(value: string): boolean {
  try { const url = new URL(value); const host = url.hostname.toLowerCase(); return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search && !isIP(host.replace(/^\[|\]$/g, '')) && host !== 'localhost' && !host.endsWith('.localhost') && !host.endsWith('.local') } catch { return false }
}
export function saveVoiceConfig(input: unknown): Promise<VoiceConfig[]> { return locked(async () => {
  if (!input || typeof input !== 'object') throw new Error('白板视频：语音配置无效。')
  const data = input as VoiceConfigInput
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 60 || (data.provider !== 'volcengine' && data.provider !== 'agent-plan') || typeof data.url !== 'string' || data.url.length > 2048 || !validUrl(data.url) || typeof data.key !== 'string' || data.key.length > 4096 || /[\r\n\0]/.test(data.key) || (data.id !== undefined && (typeof data.id !== 'string' || !/^[0-9a-f-]{36}$/.test(data.id)))) throw new Error('白板视频：请检查配置名称、HTTPS 地址和密钥。')
  const items = await read(), old = data.id ? items.find(item => item.id === data.id) : undefined
  if (data.id && !old) throw new Error('白板视频：语音配置不存在，请重新加载。')
  if (!data.key.trim() && !old) throw new Error('白板视频：请输入语音 API 密钥。')
  if (data.key.trim() && (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && ['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend())))) throw new Error('白板视频：系统安全存储不可用，无法保存密钥。')
  const item: Stored = { id: old?.id ?? randomUUID(), name: data.name.trim(), provider: data.provider, url: data.url.trim(), encryptedKey: data.key.trim() ? safeStorage.encryptString(data.key.trim()).toString('base64') : old!.encryptedKey }
  await write(old ? items.map(current => current.id === item.id ? item : current) : [...items, item]); return (old ? items.map(current => current.id === item.id ? item : current) : [...items, item]).map(publicConfig)
}) }
export function deleteVoiceConfig(id: unknown): Promise<VoiceConfig[]> { return locked(async () => { if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new Error('白板视频：语音配置无效。'); const items = await read(); if (!items.some(item => item.id === id)) throw new Error('白板视频：语音配置不存在。'); const next = items.filter(item => item.id !== id); await write(next); return next.map(publicConfig) }) }
export function resolveVoiceConfig(id: unknown): Promise<{ provider: CloudVoiceProvider; url: string; key: string; cacheId: string }> { return locked(async () => { if (typeof id !== 'string') throw new Error('白板视频：请选择语音配置。'); const item = (await read()).find(config => config.id === id); if (!item || !validUrl(item.url)) throw new Error('白板视频：语音配置不存在或地址无效，请在设置中检查。'); try { return { provider: item.provider, url: item.url, key: safeStorage.decryptString(Buffer.from(item.encryptedKey, 'base64')), cacheId: `${item.id}:${item.url}:${item.encryptedKey}` } } catch { throw new Error('白板视频：无法解密语音密钥，请在设置中重新填写。') } }) }
