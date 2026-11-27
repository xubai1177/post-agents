import { app, safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CloudVoiceProvider } from '../../../shared/whiteboard'

export function validateCloudVoiceProvider(value: unknown): CloudVoiceProvider {
  if (value !== 'volcengine' && value !== 'agent-plan') throw new Error('白板视频：语音服务无效。')
  return value
}
const keyPath = (provider: CloudVoiceProvider) => join(app.getPath('userData'), provider === 'volcengine' ? 'whiteboard-voice-key' : 'whiteboard-agent-plan-voice-key')
export async function hasVoiceKey(provider: CloudVoiceProvider): Promise<boolean> {
  try { return (await readFile(keyPath(provider))).length > 0 } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw new Error('白板视频：无法读取语音密钥。') }
}
export async function saveVoiceKey(provider: CloudVoiceProvider, value: unknown): Promise<void> {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\r\n\0]/.test(value)) throw new Error('白板视频：语音 API Key 无效。')
  if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && ['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend()))) throw new Error('白板视频：系统安全存储不可用，无法保存密钥。')
  const dir = app.getPath('userData'), temp = join(dir, `.voice-key-${randomUUID()}.tmp`)
  await mkdir(dir, { recursive: true })
  try { await writeFile(temp, safeStorage.encryptString(value.trim()), { mode: 0o600, flag: 'wx' }); await rename(temp, keyPath(provider)) } finally { await rm(temp, { force: true }) }
}
export async function clearVoiceKey(provider: CloudVoiceProvider): Promise<void> { await rm(keyPath(provider), { force: true }) }
async function getKey(provider: CloudVoiceProvider): Promise<string> {
  try { return safeStorage.decryptString(await readFile(keyPath(provider))) } catch { throw new Error(`白板视频：请先设置有效的${provider === 'agent-plan' ? ' Agent Plan 专属' : '火山语音'} API Key。`) }
}

// Volcengine streams JSON frames, including SSE data lines on some deployments.
export async function synthesizeVolcengine(provider: CloudVoiceProvider, text: string, speaker: string, speed: number, signal: AbortSignal, request: typeof fetch = fetch, keyProvider: (provider: CloudVoiceProvider) => Promise<string> = getKey, endpoint?: string): Promise<Buffer> {
  const key = await keyProvider(provider)
  const service = provider === 'agent-plan' ? 'Agent Plan 语音' : '火山语音'
  let response: Response
  try {
    response = await request(endpoint ?? (provider === 'agent-plan' ? 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional' : 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'), {
      method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': key, 'X-Api-Resource-Id': 'seed-tts-2.0', 'X-Api-Request-Id': randomUUID() },
      body: JSON.stringify({ req_params: { text, speaker, audio_params: { format: 'pcm', sample_rate: 24000, speech_rate: Math.round((speed - 1) * 100) } } })
    })
  } catch { throw new Error(`白板视频：${service}连接失败或已取消，请检查网络。`) }
  if (!response.ok || !response.body) throw new Error(`白板视频：${service}请求失败（HTTP ${response.status}），请检查密钥和服务权限。`)
  const reader = response.body.getReader(), decoder = new TextDecoder(), chunks: Buffer[] = []
  let pending = '', total = 0, finished = false
  const consume = (line: string) => {
    line = line.trim()
    if (!line || line.startsWith(':') || line.startsWith('event:')) return
    if (line.startsWith('data:')) line = line.slice(5).trim()
    let item: { code?: unknown; data?: unknown }
    try { item = JSON.parse(line) as typeof item } catch { throw new Error('白板视频：火山语音响应格式无效。') }
    if (item.code !== 0 && item.code !== 20000000) throw new Error(`白板视频：${service}合成失败（错误码 ${typeof item.code === 'number' ? item.code : '未知'}），请检查音色和服务权限。`)
    if (typeof item.data === 'string' && item.data) { const chunk = Buffer.from(item.data, 'base64'); total += chunk.length; if (total > 10 * 1024 * 1024) throw new Error('白板视频：语音数据过大。'); chunks.push(chunk) }
    if (item.code === 20000000) finished = true
  }
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; pending += decoder.decode(value, { stream: true }); if (pending.length > 15 * 1024 * 1024) throw new Error('白板视频：语音响应过大。'); const lines = pending.split('\n'); pending = lines.pop() ?? ''; for (const line of lines) consume(line) }
    pending += decoder.decode(); if (pending.trim()) consume(pending)
  } finally { reader.releaseLock() }
  if (!finished || total < 1000 || total % 2) throw new Error('白板视频：火山语音数据不完整，请重试。')
  const header = Buffer.alloc(44); header.write('RIFF', 0); header.writeUInt32LE(total + 36, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(total, 40)
  return Buffer.concat([header, ...chunks])
}
