import { constants } from 'node:fs'
import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { lstat, mkdir, open, readdir, rm } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import { decodeBackup, type BackupSettings } from './backup'
import type { BackupExportProgress } from '../../../shared/workspace'

const scrypt = promisify(scryptCallback)
const magic = Buffer.from('POSTAGENTS-BACKUP-STREAM-2\n')
const chunkSize = 64 * 1024
const validPath = (path: string): boolean => path.length <= 4096 && path.split('/').every(part => !!part && part !== '.' && part !== '..' && !/[\\/\0]/.test(part))
const deriveKey = async (password: string, salt: Buffer): Promise<Buffer> => await scrypt(password, salt, 32) as Buffer

export async function isStreamBackup(path: string): Promise<boolean> {
  const handle = await open(path, 'r')
  try { const bytes = Buffer.alloc(magic.length); const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0); return bytesRead === bytes.length && bytes.equals(magic) } finally { await handle.close() }
}

export async function exportStreamBackup(root: string, target: string, settings: BackupSettings, password: string, onProgress?: (progress: BackupExportProgress) => void): Promise<void> {
  if (password && (password.length < 8 || password.length > 1024)) throw new Error('备份密码须为 8 至 1024 个字符。')
  let files = 0, bytes = 0, lastUpdate = 0
  const report = (phase: BackupExportProgress['phase'], force = false): void => { const now = Date.now(); if (force || now - lastUpdate >= 250) { lastUpdate = now; onProgress?.({ phase, files, bytes }) } }
  report('preparing', true)
  const salt = randomBytes(16), iv = randomBytes(12)
  const cipher = password ? createCipheriv('aes-256-gcm', await deriveKey(password, salt), iv) : null
  const output = await open(target, 'wx', 0o600)
  let complete = false
  try {
    await output.writeFile(Buffer.concat([magic, Buffer.from([password ? 1 : 0]), salt, iv]))
    const write = async (data: Buffer): Promise<void> => { const bytes = cipher ? cipher.update(data) : data; if (bytes.length) await output.writeFile(bytes) }
    const record = async (value: unknown): Promise<void> => { const data = Buffer.from(JSON.stringify(value)); const size = Buffer.alloc(4); size.writeUInt32BE(data.length); await write(size); await write(data) }
    await record(password ? settings : { ...settings, credentialsIncluded: false, apiKey: '', imageApiKey: '' })
    report('writing', true)
    let count = 0
    async function walk(dir: string, prefix: string): Promise<void> {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name
        if (!validPath(rel)) throw new Error('工作空间路径无效或过长。')
        if (++count > 100000) throw new Error('工作空间文件数量过多。')
        const path = join(dir, entry.name), stat = await lstat(path)
        if (stat.isSymbolicLink()) throw new Error('工作空间包含符号链接，无法安全备份。')
        if (stat.isDirectory()) { await record({ path: rel }); await walk(path, rel); continue }
        if (!stat.isFile()) throw new Error('工作空间包含不支持的文件类型。')
        const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
        try {
          const before = await file.stat()
          if (!before.isFile() || before.ino !== stat.ino || before.dev !== stat.dev || before.size !== stat.size) throw new Error('备份期间文件发生变化，请重试。')
          await record({ path: rel, size: before.size })
          const buffer = Buffer.allocUnsafe(chunkSize); let position = 0
          while (position < before.size) { const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, before.size - position), position); if (!bytesRead) throw new Error('备份期间文件发生变化，请重试。'); await write(buffer.subarray(0, bytesRead)); position += bytesRead; bytes += bytesRead; report('writing') }
          const after = await file.stat()
          if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error('备份期间文件发生变化，请重试。')
          files++; report('writing')
        } finally { await file.close() }
      }
    }
    await walk(root, '')
    report('finishing', true)
    await write(Buffer.alloc(4))
    if (cipher) { await output.writeFile(cipher.final()); await output.writeFile(cipher.getAuthTag()) }
    complete = true
  } finally { await output.close(); if (!complete) await rm(target, { force: true }) }
}

async function* payload(path: string, password: string): AsyncGenerator<Buffer> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat(), header = Buffer.alloc(magic.length + 29)
    if (!stat.isFile() || (await file.read(header, 0, header.length, 0)).bytesRead !== header.length || !header.subarray(0, magic.length).equals(magic)) throw new Error('备份文件格式无效。')
    const flag = header[magic.length]
    if (flag !== 0 && flag !== 1) throw new Error('备份文件格式无效。')
    if (flag && !password) throw new Error('这是加密备份，请输入备份密码。')
    if (flag && (password.length < 8 || password.length > 1024)) throw new Error('备份密码须为 8 至 1024 个字符。')
    const end = stat.size - (flag ? 16 : 0)
    if (end < header.length) throw new Error('备份文件格式无效。')
    const decipher = flag ? createDecipheriv('aes-256-gcm', await deriveKey(password, header.subarray(magic.length + 1, magic.length + 17)), header.subarray(magic.length + 17)) : null
    if (decipher) { const tag = Buffer.alloc(16); if ((await file.read(tag, 0, 16, end)).bytesRead !== 16) throw new Error('备份文件格式无效。'); decipher.setAuthTag(tag) }
    const buffer = Buffer.allocUnsafe(chunkSize); let pos = header.length
    while (pos < end) { const { bytesRead } = await file.read(buffer, 0, Math.min(chunkSize, end - pos), pos); if (!bytesRead) throw new Error('备份文件已损坏。'); pos += bytesRead; yield decipher ? decipher.update(buffer.subarray(0, bytesRead)) : Buffer.from(buffer.subarray(0, bytesRead)) }
    if (decipher) { try { yield decipher.final() } catch { throw new Error('密码错误或备份文件已损坏。') } }
    const after = await file.stat(); if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error('读取期间备份文件发生变化，请重试。')
  } finally { await file.close() }
}

class Reader {
  private iterator: AsyncIterator<Buffer>
  private buffer = Buffer.alloc(0)
  constructor(source: AsyncGenerator<Buffer>) { this.iterator = source[Symbol.asyncIterator]() }
  async read(size: number): Promise<Buffer> {
    while (this.buffer.length < size) { const next = await this.iterator.next(); if (next.done) throw new Error('备份文件已损坏。'); this.buffer = Buffer.concat([this.buffer, next.value]) }
    const result = this.buffer.subarray(0, size); this.buffer = this.buffer.subarray(size); return result
  }
  async finish(): Promise<void> { if (this.buffer.length) throw new Error('备份文件格式无效。'); for (;;) { const next = await this.iterator.next(); if (next.done) break; if (next.value.length) throw new Error('备份文件格式无效。') } }
  async close(): Promise<void> { await this.iterator.return?.() }
  async record(maxLength = 1024 * 1024): Promise<unknown> { const length = (await this.read(4)).readUInt32BE(); if (!length) return null; if (length > maxLength) throw new Error('备份文件格式无效。'); try { return JSON.parse((await this.read(length)).toString('utf8')) as unknown } catch { throw new Error('备份文件格式无效。') } }
}

// Authenticate the entire encrypted file before creating any restored files.
export async function verifyStreamBackup(path: string, password: string): Promise<void> { for await (const _chunk of payload(path, password)) { /* consume */ } }

export async function restoreStreamBackup(path: string, password: string, root: string): Promise<BackupSettings> {
  const reader = new Reader(payload(path, password))
  try {
    const rawSettings = await reader.record(8 * 1024 * 1024)
    // Reuse the legacy settings validator, including the unencrypted credential rule.
    const file = await open(path, 'r'); let encrypted: boolean
    try { const flag = Buffer.alloc(1); await file.read(flag, 0, 1, magic.length); encrypted = flag[0] === 1 } finally { await file.close() }
    const settingsForValidation = encrypted && rawSettings && typeof rawSettings === 'object' ? { ...rawSettings, credentialsIncluded: false, apiKey: '', imageApiKey: '' } : rawSettings
    const legacy = Buffer.from('POSTAGENTS-BACKUP-PLAIN-1\n' + JSON.stringify({ version: 1, settings: settingsForValidation, entries: [] }))
    await decodeBackup(legacy, '')
    if (encrypted) {
      // Validate encrypted credentials using an encrypted legacy envelope.
      const config = rawSettings as Record<string, unknown>
      for (const field of ['apiKey', 'imageApiKey']) if (typeof config[field] !== 'string' || config[field].length > 8192 || config[field].includes('\0')) throw new Error('备份设置无效。')
      if (config.credentialsIncluded !== undefined && typeof config.credentialsIncluded !== 'boolean') throw new Error('备份设置无效。')
    }
    const seen = new Set<string>()
    for (;;) {
      const item = await reader.record(); if (item === null) break
      if (!item || typeof item !== 'object') throw new Error('备份内容无效。')
      const entry = item as Record<string, unknown>
      if (typeof entry.path !== 'string' || !validPath(entry.path) || seen.has(entry.path) || seen.size >= 100000) throw new Error('备份路径无效。')
      seen.add(entry.path)
      const target = join(root, ...entry.path.split('/')), rel = relative(root, target)
      if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('备份路径无效。')
      if (entry.size === undefined) { await mkdir(target, { recursive: true }); continue }
      if (typeof entry.size !== 'number' || !Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error('备份内容无效。')
      await mkdir(dirname(target), { recursive: true }); const file = await open(target, 'wx', 0o600)
      try { let remaining = entry.size; while (remaining) { const bytes = await reader.read(Math.min(chunkSize, remaining)); await file.writeFile(bytes); remaining -= bytes.length } } finally { await file.close() }
    }
    await reader.finish()
    return rawSettings as BackupSettings
  } finally { await reader.close() }
}
