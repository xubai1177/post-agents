import { randomUUID } from 'node:crypto'
import { lstat, mkdtemp, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isImageStyle } from '../../../shared/image-styles'
import type { ImageStyle } from '../../../shared/image-styles'
import { isWorkspaceNodeId, workspaceChildren, type DeleteArticleResult, type DeleteNodesPlan, type DeleteNodesResult, type WorkspaceChange, type WorkspaceFolder, type WorkspaceIndex, type WorkspaceNodeId } from '../../../shared/workspace'
import { listDrafts, safeTitle } from '../drafts/draft-store'

const fileName = '.post-agents-workspace.json'
let queue: Promise<unknown> = Promise.resolve()
function invalid(): never { throw new Error('工作空间目录数据无效。') }
function validate(value: unknown): WorkspaceIndex {
  if (!value || typeof value !== 'object') return invalid()
  const input = value as Record<string, unknown>
  if (input.version !== 1 || !Array.isArray(input.folders) || !input.assignments || typeof input.assignments !== 'object' || Array.isArray(input.assignments)) return invalid()
  const ids = new Set<string>()
  const folders: WorkspaceFolder[] = input.folders.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return invalid()
    const item = entry as Record<string, unknown>
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100 || (item.parentId !== null && typeof item.parentId !== 'string')) return invalid()
    ids.add(item.id)
    return { id: item.id, name: item.name, parentId: item.parentId as string | null }
  })
  for (const folder of folders) {
    const visited = new Set([folder.id]); let parent = folder.parentId
    while (parent !== null) { if (visited.has(parent)) return invalid(); visited.add(parent); const found = folders.find((item) => item.id === parent); if (!found) return invalid(); parent = found.parentId }
  }
  const assignments: Record<string, string> = Object.create(null) as Record<string, string>
  for (const [key, id] of Object.entries(input.assignments)) {
    if (!key || typeof id !== 'string' || !id || id === '.' || id === '..' || /[\\/\0]/.test(id)) return invalid()
    assignments[key] = id
  }
  for (const id of Object.keys(assignments)) {
    const visited = new Set<string>()
    let current: string | undefined = id
    while (current !== undefined && !ids.has(current)) {
      if (visited.has(current)) return invalid()
      visited.add(current)
      current = assignments[current]
    }
  }
  const titles: Record<string, string> = Object.create(null) as Record<string, string>
  if (input.titles !== undefined) {
    if (!input.titles || typeof input.titles !== 'object' || Array.isArray(input.titles)) return invalid()
    for (const [id, title] of Object.entries(input.titles)) { if (!id || typeof title !== 'string' || !title.trim() || title.length > 100 || /[\x00-\x1f]/.test(title)) return invalid(); titles[id] = title }
  }
  const imageStyles: Record<string, ImageStyle> = Object.create(null) as Record<string, ImageStyle>
  if (input.imageStyles !== undefined) {
    if (!input.imageStyles || typeof input.imageStyles !== 'object' || Array.isArray(input.imageStyles)) return invalid()
    for (const [id, style] of Object.entries(input.imageStyles)) { if (!id || !isImageStyle(style)) return invalid(); imageStyles[id] = style }
  }
  let order: WorkspaceNodeId[] | undefined
  if (input.order !== undefined) {
    if (!Array.isArray(input.order) || !input.order.every(isWorkspaceNodeId)) return invalid()
    order = [...new Set(input.order)]
  }
  const folderId = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(v) ? v : undefined
  const defaultFolderId = folderId(input.defaultFolderId), generationFolderId = folderId(input.generationFolderId)
  const topicFolders: Record<string, string> = Object.create(null) as Record<string, string>
  if (input.topicFolders !== undefined) {
    if (!input.topicFolders || typeof input.topicFolders !== 'object' || Array.isArray(input.topicFolders)) return invalid()
    for (const [key, value] of Object.entries(input.topicFolders)) { if (!folderId(key) || !folderId(value)) return invalid(); topicFolders[key] = value as string }
  }
  return { version: 1, folders, assignments, titles, imageStyles, ...(order && { order }), ...(defaultFolderId && { defaultFolderId }), ...(generationFolderId && { generationFolderId }), ...(Object.keys(topicFolders).length && { topicFolders }) }
}
export async function readWorkspaceIndex(root: string): Promise<WorkspaceIndex> {
  if (!root) throw new Error('请先在设置中选择草稿目录。')
  try { return validate(JSON.parse(await readFile(join(root, fileName), 'utf8')) as unknown) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, folders: [], assignments: Object.create(null) as Record<string, string>, titles: Object.create(null) as Record<string, string>, imageStyles: Object.create(null) as Record<string, ImageStyle> }
    throw error
  }
}
export function changeWorkspaceIndex(root: string, change: WorkspaceChange): Promise<WorkspaceIndex> {
  const pending = queue.then(() => changeExclusive(root, change)); queue = pending.catch(() => undefined); return pending
}
export function ensureWorkspaceIndex(root: string): Promise<WorkspaceIndex> {
  const pending = queue.then(async () => {
    const index = await readWorkspaceIndex(root), before = JSON.stringify(index)
    let folder = index.folders.find(item => item.id === index.defaultFolderId && item.parentId === null && item.name === '未分类') ?? index.folders.find(item => item.parentId === null && item.name === '未分类')
    if (!folder) { folder = { id: randomUUID(), name: '未分类', parentId: null }; index.folders.unshift(folder) }
    index.defaultFolderId = folder.id
    if (!index.folders.some(item => item.id === index.generationFolderId)) index.generationFolderId = folder.id
    for (const draft of await listDrafts(root)) if (!index.assignments[draft.id]) index.assignments[draft.id] = folder.id
    if (JSON.stringify(index) !== before) await writeWorkspaceIndex(root, index)
    return index
  }); queue = pending.catch(() => undefined); return pending
}
function removeFromOrder(index: WorkspaceIndex, removed: ReadonlySet<WorkspaceNodeId>): void {
  if (index.order) index.order = index.order.filter(id => !removed.has(id))
}
async function changeExclusive(root: string, change: WorkspaceChange): Promise<WorkspaceIndex> {
  const index = await readWorkspaceIndex(root)
  const getFolder = (id: string) => { const folder = index.folders.find((item) => item.id === id); if (!folder) throw new Error('目录不存在。'); return folder }
  const name = (value: string) => { const trimmed = value.trim(); if (!trimmed || trimmed.length > 100 || /[\x00-\x1f]/.test(trimmed)) throw new Error('目录名称无效。'); return trimmed }
  const unique = (parent: string | null, value: string, except?: string) => { if (index.folders.some((item) => item.parentId === parent && item.name === value && item.id !== except)) throw new Error('同级目录名称已存在。') }
  if (change.type === 'setGenerationFolder') { getFolder(change.id); index.generationFolderId = change.id }
  else if (change.type === 'ensureTopicFolder') {
    getFolder(change.parentId)
    const previous = index.folders.find(folder => folder.id === index.topicFolders?.[change.batchId] && folder.parentId === change.parentId)
    if (previous) return index
    const base = change.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').trim().replace(/\s+/g, ' ').replace(/[. ]+$/g, '').slice(0, 80) || '选题'
    let candidate = base, n = 2
    while (index.folders.some(folder => folder.parentId === change.parentId && folder.name === candidate)) candidate = `${base}（${n++}）`
    const id = randomUUID(); index.folders.push({ id, name: candidate, parentId: change.parentId }); index.topicFolders = { ...index.topicFolders, [change.batchId]: id }
  }
  else if (change.type === 'create') { if (change.parentId !== null) getFolder(change.parentId); const value = name(change.name); unique(change.parentId, value); index.folders.push({ id: randomUUID(), name: value, parentId: change.parentId }) }
  else if (change.type === 'rename') { const folder = getFolder(change.id), value = name(change.name); unique(folder.parentId, value, folder.id); folder.name = value }
  else if (change.type === 'delete') {
    getFolder(change.id)
    const removed = new Set([change.id])
    let count: number
    do {
      count = removed.size
      for (const folder of index.folders) if (folder.parentId && removed.has(folder.parentId)) removed.add(folder.id)
    } while (count !== removed.size)
    if (Object.keys(index.assignments).some(id => { let parent = index.assignments[id]; const visited = new Set<string>(); while (parent && !visited.has(parent)) { if (removed.has(parent)) return true; visited.add(parent); parent = index.assignments[parent] } return false })) throw new Error('目录包含文章，请使用完整删除操作。')
    index.folders = index.folders.filter(folder => !removed.has(folder.id))
    const detached = new Set([...removed].map<WorkspaceNodeId>(id => `folder:${id}`))
    for (const [id, folder] of Object.entries(index.assignments)) {
      if (!removed.has(folder)) continue
      delete index.assignments[id]
      detached.add(`article:${id}`)
    }
    removeFromOrder(index, detached)
  }
  else if (change.type === 'setImageStyle') { if (!isImageStyle(change.style) || !(await listDrafts(root)).some((item) => item.id === change.draftId)) throw new Error('文章或图片风格无效。'); index.imageStyles[change.draftId] = change.style }
  else if (change.type === 'renameArticle') {
    const drafts = await listDrafts(root), draft = drafts.find((item) => item.id === change.draftId)
    if (!draft) throw new Error('文章不存在。')
    const current = index.titles[draft.id] ?? draft.title
    if (current !== change.expectedTitle) throw new Error('文章标题已在其他位置修改，请重新打开后重试。')
    const title = change.title.trim()
    if (!title || title.length > 100 || /[\x00-\x1f]/.test(title)) throw new Error('文章标题无效。')
    if (drafts.some((item) => item.id !== draft.id && (index.titles[item.id] ?? item.title) === title)) throw new Error('已有同名文章，请更换标题。')
    if (title === draft.title) delete index.titles[draft.id]; else index.titles[draft.id] = title
  }
  else if (change.type === 'moveNodes') {
    if (change.folderId !== null) getFolder(change.folderId)
    const drafts = await listDrafts(root)
    const nodes = [...new Set(change.nodes)]
    if (!nodes.length) throw new Error('请选择要移动的项目。')
    const selectedFolders = new Set(nodes.filter(node => node.startsWith('folder:')).map(node => node.slice(7)))
    for (const id of selectedFolders) getFolder(id)
    for (let parent = change.folderId; parent !== null; parent = getFolder(parent).parentId) {
      if (selectedFolders.has(parent)) throw new Error('不能将文件夹移动到自身或其子文件夹。')
    }
    const movedFolders = index.folders.filter(folder => {
      if (!selectedFolders.has(folder.id)) return false
      for (let parent = folder.parentId; parent !== null; parent = getFolder(parent).parentId) if (selectedFolders.has(parent)) return false
      return true
    })
    const names = new Set(index.folders.filter(folder => folder.parentId === change.folderId && !selectedFolders.has(folder.id)).map(folder => folder.name))
    for (const folder of movedFolders) {
      if (names.has(folder.name)) throw new Error('目标目录中已有同名文件夹。')
      names.add(folder.name)
    }
    for (const node of nodes) if (node.startsWith('article:') && !drafts.some(draft => draft.id === node.slice(8))) throw new Error('文章不存在。')
    const moved = new Set<WorkspaceNodeId>()
    for (const folder of movedFolders) { if (folder.parentId !== change.folderId) { folder.parentId = change.folderId; moved.add(`folder:${folder.id}`) } }
    for (const node of nodes) if (node.startsWith('article:')) {
      const id = node.slice(8)
      let parent: string | null = index.assignments[id] ?? null
      let contained = false
      while (parent !== null) { if (selectedFolders.has(parent)) { contained = true; break }; parent = getFolder(parent).parentId }
      if (contained || (index.assignments[id] ?? null) === change.folderId) continue
      if (change.folderId === null) delete index.assignments[id]; else index.assignments[id] = change.folderId
      moved.add(node)
    }
    removeFromOrder(index, moved)
  }
  else if (change.type === 'moveDraft') {
    const drafts = await listDrafts(root)
    if (!drafts.some((item) => item.id === change.draftId)) throw new Error('草稿不存在。')
    const previousParent = index.assignments[change.draftId] ?? null
    if (change.folderId === null) delete index.assignments[change.draftId]
    else {
      if (!index.folders.some(item => item.id === change.folderId) && !drafts.some(item => item.id === change.folderId)) throw new Error('目标文章不存在。')
      let parent: string | undefined = change.folderId
      const visited = new Set<string>()
      while (parent !== undefined) {
        if (parent === change.draftId || visited.has(parent)) throw new Error('不能将文章移动到自身或其子文章下。')
        visited.add(parent)
        parent = index.assignments[parent]
      }
      index.assignments[change.draftId] = change.folderId
    }
    if (previousParent !== change.folderId) removeFromOrder(index, new Set<WorkspaceNodeId>([`article:${change.draftId}`]))
  }
  else if (change.type === 'reorder') {
    const siblings = workspaceChildren(index, await listDrafts(root), change.parentId).map(node => node.id)
    if (!siblings.includes(change.node) || !siblings.includes(change.target)) throw new Error('只能调整同级目录项的顺序。')
    if (change.node === change.target) return index
    const reordered = siblings.filter(id => id !== change.node)
    const offset = change.position === 'after' ? 1 : 0
    reordered.splice(reordered.indexOf(change.target) + offset, 0, change.node)
    if (reordered.every((id, position) => id === siblings[position])) return index
    const siblingIds = new Set(siblings)
    index.order = [...(index.order ?? []).filter(id => !siblingIds.has(id)), ...reordered]
  }
  else throw new Error('目录操作无效。')
  await writeWorkspaceIndex(root, index)
  return index
}
async function writeWorkspaceIndex(root: string, index: WorkspaceIndex): Promise<void> {
  const target = join(root, fileName), temporary = join(root, `.workspace-${randomUUID()}.tmp`)
  try { await writeFile(temporary, JSON.stringify(index, null, 2), { flag: 'wx', mode: 0o600 }); await rename(temporary, target) } finally { await rm(temporary, { force: true }) }
}
type DeleteDependencies = { writeIndex: (root: string, index: WorkspaceIndex) => Promise<void>; removeTree: (path: string) => Promise<void> }
const deleteDefaults: DeleteDependencies = { writeIndex: writeWorkspaceIndex, removeTree: async (path) => rm(path, { recursive: true }) }
export function deleteWorkspaceArticle(root: string, id: string, deps: DeleteDependencies = deleteDefaults): Promise<DeleteArticleResult> {
  const pending = queue.then(() => deleteArticleExclusive(root, id, deps)); queue = pending.catch(() => undefined); return pending
}
async function deleteArticleExclusive(root: string, id: string, deps: DeleteDependencies): Promise<DeleteArticleResult> {
  if (!root || !id || id === '.' || id === '..' || /[\\/\0]/.test(id)) throw new Error('文章路径无效。')
  const index = await readWorkspaceIndex(root)
  if (!(await listDrafts(root)).some((item) => item.id === id)) throw new Error('文章不存在。')
  const original = join(root, id), stat = await lstat(original)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('文章路径无效。')
  const staging = await mkdtemp(join(root, '.post-agents-delete-')), stagedArticle = join(staging, 'article')
  try { await rename(original, stagedArticle) } catch (error) { await rmdir(staging); throw error }
  async function restoreArticle(): Promise<void> {
    try { await lstat(original); throw new Error(`原位置已被占用，文章资源暂存于 ${stagedArticle}，请手动恢复。`) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    try { await rename(stagedArticle, original) } catch { throw new Error(`文章资源暂存于 ${stagedArticle}，请手动恢复。`) }
    try { await rmdir(staging) } catch { throw new Error(`文章已恢复，但临时目录 ${staging} 未清理，请手动检查。`) }
  }
  let sameArticle = false
  try { const stagedStat = await lstat(stagedArticle); sameArticle = stagedStat.isDirectory() && !stagedStat.isSymbolicLink() && stagedStat.ino === stat.ino && stagedStat.dev === stat.dev } catch { /* Rollback below if verification fails. */ }
  if (!sameArticle) {
    try { await restoreArticle() } catch (error) { throw new Error(`删除未完成：${error instanceof Error ? error.message : '请检查临时目录。'}`) }
    throw new Error('文章在删除期间发生变化，未执行删除。')
  }
  const parent = index.assignments[id]
  const detached = new Set<WorkspaceNodeId>([`article:${id}`])
  for (const [child, assignedParent] of Object.entries(index.assignments)) {
    if (assignedParent === id) {
      if (parent) index.assignments[child] = parent
      else delete index.assignments[child]
      detached.add(`article:${child}`)
    }
  }
  delete index.assignments[id]; delete index.titles[id]; delete index.imageStyles[id]
  removeFromOrder(index, detached)
  try { await deps.writeIndex(root, index) } catch {
    try { await restoreArticle() } catch (error) { throw new Error(`删除未完成：${error instanceof Error ? error.message : '请检查临时目录。'}`) }
    throw new Error('删除未完成，文章及其资源已保留。')
  }
  try { await deps.removeTree(staging) } catch { return { index, warning: `文章已从目录移除，但部分本地资源未删除，暂存于 ${staging}，请手动处理。` } }
  return { index }
}

async function buildDeleteNodesPlan(root: string, nodes: WorkspaceNodeId[]): Promise<DeleteNodesPlan> {
  const index = await readWorkspaceIndex(root), drafts = await listDrafts(root)
  const uniqueNodes = [...new Set(nodes)].sort()
  if (!uniqueNodes.length) throw new Error('请选择要删除的项目。')
  const folderIds = new Set(uniqueNodes.filter(node => node.startsWith('folder:')).map(node => node.slice(7)))
  const articleIds = new Set(uniqueNodes.filter(node => node.startsWith('article:')).map(node => node.slice(8)))
  for (const id of folderIds) if (!index.folders.some(folder => folder.id === id)) throw new Error('文件夹已变化，请重新选择。')
  for (const id of articleIds) if (!drafts.some(draft => draft.id === id)) throw new Error('文章已变化，请重新选择。')
  let count: number
  do { count = folderIds.size; for (const folder of index.folders) if (folder.parentId && folderIds.has(folder.parentId)) folderIds.add(folder.id) } while (count !== folderIds.size)
  for (const id of new Set([...drafts.map(draft => draft.id), ...Object.keys(index.assignments)])) {
    let parent = index.assignments[id]
    const visited = new Set<string>()
    while (parent && !visited.has(parent)) { if (folderIds.has(parent)) { articleIds.add(id); break }; visited.add(parent); parent = index.assignments[parent] }
  }
  return { nodes: uniqueNodes, folderIds: [...folderIds].sort(), articleIds: [...articleIds].sort() }
}
export function previewDeleteNodes(root: string, nodes: WorkspaceNodeId[]): Promise<DeleteNodesPlan> {
  const pending = queue.then(() => buildDeleteNodesPlan(root, nodes)); queue = pending.catch(() => undefined); return pending
}
export function deleteWorkspaceNodes(root: string, expected: DeleteNodesPlan, isActive: (id: string) => boolean): Promise<DeleteNodesResult> {
  const pending = queue.then(async () => {
    const plan = await buildDeleteNodesPlan(root, expected.nodes)
    if (JSON.stringify(plan) !== JSON.stringify(expected)) throw new Error('删除范围已变化，请重新确认。')
    const active = plan.articleIds.filter(isActive)
    if (active.length) throw new Error(`有 ${active.length} 篇文章正在生成，请完成后重试。`)
    const deletedArticleIds: string[] = [], deletedFolderIds: string[] = [], errors: string[] = []
    for (const id of plan.articleIds) {
      if (isActive(id)) { errors.push(`${id}：文章正在生成，请完成后重试。`); continue }
      try { const result = await deleteArticleExclusive(root, id, deleteDefaults); deletedArticleIds.push(id); if (result.warning) errors.push(result.warning) }
      catch (error) { errors.push(`${id}：${error instanceof Error ? error.message : '删除失败'}`) }
    }
    let index = await readWorkspaceIndex(root)
    if (deletedArticleIds.length === plan.articleIds.length) {
      for (const id of plan.folderIds) {
        if (!index.folders.some(folder => folder.id === id)) continue
        const before = new Set(index.folders.map(folder => folder.id))
        try { index = await changeExclusive(root, { type: 'delete', id }); const remaining = new Set(index.folders.map(folder => folder.id)); for (const oldId of before) if (!remaining.has(oldId)) deletedFolderIds.push(oldId) }
        catch (error) { errors.push(`文件夹删除失败：${error instanceof Error ? error.message : '请重试'}`) }
      }
    } else if (plan.folderIds.length) errors.push('部分文章未删除，相关文件夹已保留。')
    return { index, deletedArticleIds, deletedFolderIds, errors }
  }); queue = pending.catch(() => undefined); return pending
}

export async function assertAvailableArticleTitle(root: string, input: string): Promise<void> {
  const title = safeTitle(input), index = await readWorkspaceIndex(root), drafts = await listDrafts(root)
  if (drafts.some((draft) => draft.id === title || (index.titles[draft.id] ?? draft.title) === title)) throw new Error('已有同名主题，请更换主题名称。')
}
