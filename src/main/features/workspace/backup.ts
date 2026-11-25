import { isPlatformPrompts, type PlatformPrompts } from '../../../shared/platform-prompts'
import { constants } from 'node:fs'
import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'
import { lstat, mkdir, open, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'

const scrypt = promisify(scryptCallback)
const magic = Buffer.from('POSTAGENTS-BACKUP-1\n')
const plainMagic = Buffer.from('POSTAGENTS-BACKUP-PLAIN-1\n')
export interface BackupSettings { credentialsIncluded?: boolean; apiUrl: string; model: string; apiKey: string; imageService: 'shared' | 'custom'; imageApiUrl: string; imageModel: string; imageApiKey: string; platformPrompts?: PlatformPrompts; titlePrompts?: PlatformPrompts }
interface Entry { path: string; data?: string }
interface Snapshot { version: 1; settings: BackupSettings; entries: Entry[] }
function validName(part: string): boolean { return !!part && part !== '.' && part !== '..' && !/[\\/\0]/.test(part) }
function validPath(path: string): boolean { return path.length <= 4096 && path.split('/').every(validName) }
function checkPassword(password: string): void { if (password.length < 8 || password.length > 1024) throw new Error('备份密码须为 8 至 1024 个字符。') }
async function key(password: string, salt: Buffer): Promise<Buffer> { return await scrypt(password, salt, 32) as Buffer }
export async function createBackup(root: string, settings: BackupSettings, password: string): Promise<Buffer> {
  if (password) checkPassword(password)
  const entries: Entry[] = []
  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!validName(entry.name)) throw new Error('工作空间包含无法备份的文件名。')
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name, path = join(dir, entry.name)
      if (!validPath(rel)) throw new Error('工作空间路径过长。')
      const stat = await lstat(path)
      if (stat.isSymbolicLink()) throw new Error('工作空间包含符号链接，无法安全备份。')
      if (stat.isDirectory()) { entries.push({ path: rel }); await walk(path, rel) }
      else if (stat.isFile()) { const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); let data: Buffer; try { const before = await handle.stat(); if (!before.isFile() || before.ino !== stat.ino || before.dev !== stat.dev || before.size !== stat.size) throw new Error('备份期间文件发生变化，请重试。'); data = await handle.readFile(); const after = await handle.stat(); if (data.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error('备份期间文件发生变化，请重试。') } finally { await handle.close() }; entries.push({ path: rel, data: data.toString('base64') }) }
      else throw new Error('工作空间包含不支持的文件类型。')
      if (entries.length > 100000) throw new Error('工作空间文件数量过多。')
    }
  }
  await walk(root, '')
  const backupSettings = password ? settings : { ...settings, credentialsIncluded: false, apiKey: '', imageApiKey: '' }
  const payload = Buffer.from(JSON.stringify({ version: 1, settings: backupSettings, entries } satisfies Snapshot))
  if (!password) return Buffer.concat([plainMagic, payload])
  const salt = randomBytes(16), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', await key(password, salt), iv)
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()])
  return Buffer.concat([magic, salt, iv, cipher.getAuthTag(), encrypted])
}
export async function decodeBackup(bytes: Buffer, password: string): Promise<Snapshot> {
  let raw: unknown
  if (bytes.subarray(0, plainMagic.length).equals(plainMagic)) {
    try { raw = JSON.parse(bytes.subarray(plainMagic.length).toString('utf8')) as unknown } catch { throw new Error('备份文件格式无效。') }
  } else {
    if (bytes.length < magic.length + 44 || !bytes.subarray(0, magic.length).equals(magic)) throw new Error('备份文件格式无效。')
    if (!password) throw new Error('这是加密备份，请输入备份密码。')
    checkPassword(password)
    let offset = magic.length; const salt = bytes.subarray(offset, offset += 16), iv = bytes.subarray(offset, offset += 12), tag = bytes.subarray(offset, offset += 16)
    try { const decipher = createDecipheriv('aes-256-gcm', await key(password, salt), iv); decipher.setAuthTag(tag); raw = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(offset)), decipher.final()]).toString('utf8')) as unknown } catch { throw new Error('密码错误或备份文件已损坏。') }
  }
  if (!raw || typeof raw !== 'object') throw new Error('备份内容无效。')
  const value = raw as Record<string, unknown>, settings = value.settings
  if (value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 100000 || !settings || typeof settings !== 'object') throw new Error('备份内容无效。')
  const config = settings as Record<string, unknown>
  if (config.credentialsIncluded !== undefined && typeof config.credentialsIncluded !== 'boolean') throw new Error('备份设置无效。')
  if (bytes.subarray(0, plainMagic.length).equals(plainMagic) && (config.credentialsIncluded !== false || config.apiKey !== '' || config.imageApiKey !== '')) throw new Error('无密码备份的密钥设置无效。')
  for (const field of ['apiUrl', 'model', 'apiKey', 'imageApiUrl', 'imageModel', 'imageApiKey']) if (typeof config[field] !== 'string' || (config[field] as string).length > 8192 || (config[field] as string).includes('\0')) throw new Error('备份设置无效。')
  if (config.titlePrompts !== undefined && !isPlatformPrompts(config.titlePrompts)) throw new Error('备份设置无效。')
  if (config.platformPrompts !== undefined && !isPlatformPrompts(config.platformPrompts)) throw new Error('备份设置无效。')
  if (config.imageService !== 'shared' && config.imageService !== 'custom') throw new Error('备份设置无效。')
  const seen = new Set<string>()
  const entries: Entry[] = value.entries.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('备份内容无效。')
    const item = entry as Record<string, unknown>
    if (typeof item.path !== 'string' || !validPath(item.path) || seen.has(item.path) || (item.data !== undefined && (typeof item.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.data)))) throw new Error('备份路径或内容无效。')
    seen.add(item.path)
    if (typeof item.data === 'string') return { path: item.path, data: item.data }
    return { path: item.path }
  })
  return { version: 1, settings: config as unknown as BackupSettings, entries }
}
export async function restoreBackup(snapshot: Snapshot, emptyRoot: string): Promise<void> {
  for (const entry of snapshot.entries) {
    const path = join(emptyRoot, ...entry.path.split('/')), rel = relative(emptyRoot, path)
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || !validName(basename(path))) throw new Error('备份路径无效。')
    if (entry.data === undefined) await mkdir(path, { recursive: true })
    else { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, Buffer.from(entry.data, 'base64'), { flag: 'wx', mode: 0o600 }) }
  }
}
export async function writeBackupExclusive(path: string, data: Buffer): Promise<void> {
  const handle = await open(path, 'wx', 0o600)
  try { await handle.writeFile(data) } catch (error) { await handle.close(); await rm(path, { force: true }); throw error }
  await handle.close()
}
