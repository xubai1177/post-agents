import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { canvasProjectDataSchema, type CanvasProject, type CanvasProjectSummary } from '../../../shared/canvas-project'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const locks = new Set<string>()
async function directory(root: string): Promise<string> {
  const dir = join(root, '白板画布工程')
  await mkdir(dir, { recursive: true })
  const info = await lstat(dir)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('白板视频：画布工程目录无效。')
  return dir
}
export async function withCanvasProjectLock<T>(root: string, id: string, work: () => Promise<T>): Promise<T> {
  if (!uuid.test(id)) throw new Error('白板视频：工程编号无效。')
  const key = join(await directory(root), id)
  if (locks.has(key)) throw new Error('白板视频：工程正在保存，请稍后重试。')
  locks.add(key)
  try { return await work() } finally { locks.delete(key) }
}
async function loadFrom(dir: string, id: string): Promise<CanvasProject> {
  if (!uuid.test(id)) throw new Error('白板视频：工程编号无效。')
  const path = join(dir, `${id}.json`), info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > 100_000_000) throw new Error('白板视频：工程文件无效或过大。')
  const content = await readFile(path, 'utf8')
  const raw: unknown = JSON.parse(content)
  if (!raw || typeof raw !== 'object' || !('id' in raw) || raw.id !== id || !('revision' in raw) || typeof raw.revision !== 'string' || !uuid.test(raw.revision) || !('updatedAt' in raw) || typeof raw.updatedAt !== 'string' || Number.isNaN(Date.parse(raw.updatedAt))) throw new Error('白板视频：工程数据无效。')
  const data = canvasProjectDataSchema.parse(raw)
  return { ...data, id, revision: createHash('sha256').update(content).digest('hex'), updatedAt: raw.updatedAt }
}
export async function listCanvasProjects(root: string): Promise<CanvasProjectSummary[]> {
  const dir = await directory(root)
  const records = await Promise.all((await readdir(dir)).filter(name => name.endsWith('.json') && uuid.test(name.slice(0, -5))).map(async name => { try { const p = await loadFrom(dir, name.slice(0, -5)); return { id: p.id, name: p.name, updatedAt: p.updatedAt } } catch { return null } }))
  return records.filter((p): p is CanvasProjectSummary => p !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
export async function loadCanvasProject(root: string, id: string): Promise<CanvasProject> { return loadFrom(await directory(root), id) }
export async function saveCanvasProject(root: string, id: string | null, revision: string | null, input: unknown): Promise<CanvasProject> {
  const data = canvasProjectDataSchema.parse(input), dir = await directory(root), projectId = id ?? randomUUID(), key = join(dir, projectId)
  if (!uuid.test(projectId) || (id !== null && (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)))) throw new Error('白板视频：工程编号无效。')
  if (locks.has(key)) throw new Error('白板视频：工程正在保存，请稍后重试。')
  locks.add(key)
  let temp = ''
  try {
    if (id !== null && (await loadFrom(dir, id)).revision !== revision) throw new Error('白板视频：工程已在外部修改，请重新打开后再保存。')
    const project: CanvasProject = { ...data, id: projectId, revision: randomUUID(), updatedAt: new Date().toISOString() }
    const serialized = JSON.stringify(project)
    if (Buffer.byteLength(serialized) > 100_000_000) throw new Error('白板视频：工程超过 100 MB，请减少素材后重试。')
    temp = join(dir, `.${randomUUID()}.tmp`)
    await writeFile(temp, serialized, { flag: 'wx', mode: 0o600 })
    await rename(temp, join(dir, `${projectId}.json`)); temp = ''
    return { ...project, revision: createHash('sha256').update(serialized).digest('hex') }
  } finally { if (temp) await unlink(temp).catch(() => {}); locks.delete(key) }
}
