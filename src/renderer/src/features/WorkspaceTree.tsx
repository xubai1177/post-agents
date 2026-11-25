import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import type { ArticleRun, Draft, Platform } from '../../../shared/drafts'
import { isWorkspaceNodeId, workspaceChildren, type DeleteNodesPlan, type DeleteNodesResult, type WorkspaceChange, type WorkspaceFolder, type WorkspaceIndex, type WorkspaceNodeId } from '../../../shared/workspace'
import { Icon } from '../components/Icon'
import { useMessage } from '../components/MessageProvider'
import { platformLogos } from './platform-logos'

type Props = { drafts: Draft[]; articleRuns: ArticleRun[]; selectedId: string; selectedPlatform: Platform; platformTitles: Record<string, { value: string }>; enabled: boolean; refreshKey: number; createRequest: number; onOpen: (draft: Draft, platform: Platform) => void; selectedFolderId: string | null; onOpenFolder: (id: string) => void; onIndexChange: (index: WorkspaceIndex) => void; onCreateArticle: (folderId: string) => void; onDeleteNodes: (plan: DeleteNodesPlan) => Promise<DeleteNodesResult | null> }
type Editor = { type: 'create'; parentId: string | null } | { type: 'rename'; folder: WorkspaceFolder }
type DraggedNode = { node: WorkspaceNodeId; parentId: string | null; draftId?: string }
type DropChange = Extract<WorkspaceChange, { type: 'reorder' | 'moveDraft' }>
const treeDragType = 'application/x-post-agents-tree-node'

function readExpandedNodes(key: string): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (Array.isArray(value)) return new Set(value.filter((id): id is string => typeof id === 'string'))
  } catch { /* Unavailable or invalid local preferences start with a collapsed tree. */ }
  return new Set()
}

export function WorkspaceTree({ drafts, articleRuns, selectedId, selectedPlatform, platformTitles, enabled, refreshKey, createRequest, onOpen, selectedFolderId, onOpenFolder, onIndexChange, onCreateArticle, onDeleteNodes }: Props) {
  const showMessage = useMessage()
  const [index, setIndex] = useState<WorkspaceIndex>({ version: 1, folders: [], assignments: {}, titles: {}, imageStyles: {} })
  const [expandedNodes, setExpandedNodes] = useState<ReadonlySet<string>>(() => new Set())
  const expansion = useRef<{ key: string; nodes: ReadonlySet<string> }>({ key: '', nodes: expandedNodes })
  const [message, setMessage] = useState('')
  const [selectedNodes, setSelectedNodes] = useState<ReadonlySet<WorkspaceNodeId>>(new Set())
  const [deletePlan, setDeletePlan] = useState<DeleteNodesPlan | null>(null)
  const anchorNode = useRef<WorkspaceNodeId | null>(null)
  const treeRoot = useRef<HTMLDivElement>(null)
  function visibleNodes(): WorkspaceNodeId[] {
    return Array.from(treeRoot.current?.querySelectorAll<HTMLElement>('summary[data-tree-node]') ?? []).filter(row => {
      let parent = row.parentElement?.parentElement
      while (parent && parent !== treeRoot.current) { if (parent instanceof HTMLDetailsElement && !parent.open) return false; parent = parent.parentElement }
      return true
    }).map(row => row.dataset.treeNode).filter(isWorkspaceNodeId)
  }
  function selectNode(event: ReactMouseEvent<HTMLElement>, node: WorkspaceNodeId) {
    if (event.shiftKey && anchorNode.current) {
      const visible = visibleNodes(), from = visible.indexOf(anchorNode.current), to = visible.indexOf(node)
      if (from >= 0 && to >= 0) { const range = visible.slice(Math.min(from, to), Math.max(from, to) + 1); setSelectedNodes(event.metaKey || event.ctrlKey ? new Set([...selectedNodes, ...range]) : new Set(range)); return }
    }
    if (event.ctrlKey || event.metaKey) {
      const next = new Set(selectedNodes); if (next.has(node)) next.delete(node); else next.add(node); setSelectedNodes(next)
    } else setSelectedNodes(new Set([node]))
    anchorNode.current = node
  }
  function hasSelectedAncestor(parentId: string | null): boolean {
    while (parentId) { if (selectedNodes.has(`folder:${parentId}`)) return true; parentId = index.folders.find(folder => folder.id === parentId)?.parentId ?? null }
    return false
  }
  async function moveSelection(folderId: string | null) {
    const ok = await change({ type: 'moveNodes', nodes: [...selectedNodes], folderId })
    if (ok) { setSelectedNodes(new Set()); showMessage('所选项目已移动。') }
  }
  async function beginDelete(nodes: WorkspaceNodeId[]) {
    if (pending || !enabled) return
    setPending(true); setMessage('')
    try {
      const result = await window.workspaceApi.previewDeleteNodes(nodes)
      if (result.ok) setDeletePlan(result.value)
      else showMessage(result.error, true)
    } catch { showMessage('无法读取删除范围，请重试。', true) }
    finally { setPending(false) }
  }
  async function deleteSelection() {
    if (!deletePlan || deletingSelection.current) return
    deletingSelection.current = true
    try {
      const result = await onDeleteNodes(deletePlan)
      if (!result) { setDeletePlan(null); return }
      const completed = new Set<WorkspaceNodeId>([...result.deletedFolderIds.map((id): WorkspaceNodeId => `folder:${id}`), ...result.deletedArticleIds.map((id): WorkspaceNodeId => `article:${id}`)])
      setSelectedNodes(current => new Set([...current].filter(node => !completed.has(node))))
      setDeletePlan(null)
    } finally { deletingSelection.current = false }
  }

  const [editor, setEditor] = useState<Editor | null>(null)
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const draggedNode = useRef<DraggedNode | null>(null)
  const draggedSelection = useRef(false)
  const deletingSelection = useRef(false)
  const [dropMarker, setDropMarker] = useState<string | null>(null)
  const [folderMenu, setFolderMenu] = useState<{ folder: WorkspaceFolder; x: number; y: number } | null>(null)
  const [articleMenu, setArticleMenu] = useState<{ draft: Draft; x: number; y: number } | null>(null)
  const restoreMenuFocus = useRef(true)
  const menuSummaryRef = useRef<HTMLElement | null>(null)
  const lastCreateRequest = useRef(createRequest)
  const savingName = useRef(false)
  const cancelNameBlur = useRef(false)
  useEffect(() => {
    if (lastCreateRequest.current !== createRequest && !pending) { lastCreateRequest.current = createRequest; setMessage(''); setName(''); setEditor({ type: 'create', parentId: null }) }
  }, [createRequest, pending])
  useEffect(() => {
    let active = true
    setEditor(null); setFolderMenu(null); setArticleMenu(null); setMessage('')
    void window.workspaceApi.read().then((result) => {
      if (!active) return
      if (result.ok) {
        const key = `post-agents-workspace-tree-expanded:${result.value.directory}`
        if (expansion.current.key !== key) {
          const nodes = readExpandedNodes(key)
          expansion.current = { key, nodes }
          setExpandedNodes(nodes)
        }
        setIndex(result.value); onIndexChange(result.value)
      } else { setIndex({ version: 1, folders: [], assignments: {}, titles: {}, imageStyles: {} }); setMessage(result.error) }
    }).catch(() => { if (active) setMessage('无法读取目录。') })
    return () => { active = false }
  }, [refreshKey])
  function saveExpandedNodes(nodes: ReadonlySet<string>) {
    const { key } = expansion.current
    expansion.current = { key, nodes }
    setExpandedNodes(nodes)
    if (!key) return
    try { localStorage.setItem(key, JSON.stringify([...nodes])) }
    catch { showMessage('无法保存目录展开状态。', true) }
  }
  function setNodeOpen(node: string, open: boolean) {
    if (expansion.current.nodes.has(node) === open) return
    const nodes = new Set(expansion.current.nodes)
    if (open) nodes.add(node)
    else nodes.delete(node)
    saveExpandedNodes(nodes)
  }
  async function change(value: WorkspaceChange): Promise<boolean> {
    if (pending) return false
    setPending(true)
    try {
      const result = await window.workspaceApi.change(value)
      if (!result.ok) { setMessage(result.error); return false }
      if (value.type === 'delete') {
        const remaining = new Set(result.value.folders.map(folder => `folder:${folder.id}`))
        const nodes = new Set([...expansion.current.nodes].filter(node => !node.startsWith('folder:') || remaining.has(node)))
        if (nodes.size !== expansion.current.nodes.size) saveExpandedNodes(nodes)
      }
      setIndex(result.value)
      onIndexChange(result.value)
      onIndexChange(result.value)
      setMessage('')
      return true
    } catch {
      setMessage('目录操作失败。')
      return false
    } finally { setPending(false) }
  }
  function beginCreate(parentId: string | null) { setMessage(''); setName(''); setEditor({ type: 'create', parentId }) }
  function beginRename(folder: WorkspaceFolder) { setMessage(''); setName(folder.name); setEditor({ type: 'rename', folder }) }
  async function commitName() {
    if (!editor || savingName.current || cancelNameBlur.current) return
    if (!name.trim()) { setEditor((current) => current === editor ? null : current); setMessage(''); return }
    const value: WorkspaceChange = editor.type === 'create' ? { type: 'create', name, parentId: editor.parentId } : { type: 'rename', name, id: editor.folder.id }
    savingName.current = true
    try { if (await change(value)) setEditor((current) => current === editor ? null : current) } finally { savingName.current = false }
  }
  function saveName(event: FormEvent) { event.preventDefault(); void commitName() }
  function startDrag(event: DragEvent, source: DraggedNode) {
    if (!enabled || pending) { event.preventDefault(); return }
    if (!selectedNodes.has(source.node)) { setSelectedNodes(new Set([source.node])); anchorNode.current = source.node }
    draggedNode.current = source
    event.dataTransfer.setData(treeDragType, source.node)
    event.dataTransfer.effectAllowed = 'move'
  }
  function endDrag() {
    draggedNode.current = null
    setDropMarker(null)
  }
  function getDropChange(event: DragEvent): DropChange | null {
    const source = draggedNode.current
    if (!source || !enabled || pending || !(event.target instanceof Element)) return null
    const row = event.target.closest<HTMLElement>('summary[data-tree-node]') ??
      event.target.closest('.tree-more')?.parentElement?.querySelector<HTMLElement>('summary[data-tree-node]')
    const target = row?.dataset.treeNode
    if (target === source.node) return null
    const batchDrag = selectedNodes.size > 1 && selectedNodes.has(source.node)
    if (!batchDrag && row && isWorkspaceNodeId(target) && (row.dataset.treeParent || null) === source.parentId) {
      const bounds = row.getBoundingClientRect()
      const ratio = (event.clientY - bounds.top) / bounds.height
      const moveInside = source.draftId && target.startsWith('folder:') && ratio >= 0.25 && ratio <= 0.75
      if (!moveInside) return { type: 'reorder', parentId: source.parentId, node: source.node, target, position: ratio < 0.5 ? 'before' : 'after' }
    }
    const destination = (row ?? event.target).closest<HTMLElement>('[data-drop-folder]')
    const folderId = destination?.dataset.dropFolder || null
    if (batchDrag && destination && (folderId || [...selectedNodes].every(node => node.startsWith('folder:'))) && (!folderId || !selectedNodes.has(`folder:${folderId}`))) return { type: 'moveDraft', draftId: source.draftId ?? '', folderId }
    if (source.draftId && destination && folderId && source.parentId !== folderId) return { type: 'moveDraft', draftId: source.draftId, folderId }
    return null
  }
  function dragOver(event: DragEvent) {
    const action = getDropChange(event)
    if (!action) { setDropMarker(null); return }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropMarker(action.type === 'reorder' ? `${action.position}:${action.target}` : `inside:${action.folderId ?? ''}`)
  }
  function drop(event: DragEvent) {
    event.preventDefault()
    const action = getDropChange(event)
    draggedSelection.current = !!draggedNode.current && selectedNodes.has(draggedNode.current.node)
    endDrag()
    if (action && selectedNodes.size > 1 && draggedSelection.current) void moveSelection(action.type === 'moveDraft' ? action.folderId : action.parentId)
    else if (action) void change(action)
  }
  function dropPosition(node: WorkspaceNodeId) {
    if (dropMarker === `before:${node}`) return 'before'
    if (dropMarker === `after:${node}`) return 'after'
  }
  function folderPath(folder: WorkspaceFolder): string {
    const names = [folder.name]; let parentId = folder.parentId
    while (parentId) { const parent = index.folders.find((item) => item.id === parentId); if (!parent) break; names.unshift(parent.name); parentId = parent.parentId }
    return names.join(' / ')
  }
  function openArticleMenu(draft: Draft, x: number, y: number, element: HTMLElement) {
    if (!enabled || pending) return
    const node: WorkspaceNodeId = `article:${draft.id}`
    if (!selectedNodes.has(node)) { setSelectedNodes(new Set([node])); anchorNode.current = node }
    menuSummaryRef.current = element; restoreMenuFocus.current = true; setFolderMenu(null)
    setArticleMenu({ draft, x: Math.max(8, Math.min(x, window.innerWidth - 225)), y: Math.max(8, Math.min(y, window.innerHeight - 230)) })
  }
  function articleRow(draft: Draft, folderId: string | null) {
    const titledDraft = { ...draft, title: index.titles[draft.id] ?? draft.title }
    const run = articleRuns.find(item => item.id === draft.id)
    const running = run && (run.status === 'queued' || run.status === 'running')
    const needsAttention = run && ['failed', 'waiting', 'interrupted'].includes(run.status)
    const node = `article:${draft.id}` as const
    return <div className="workspace-draft" key={node} draggable={enabled && !pending}
      onDragStart={(event) => startDrag(event, { node, parentId: folderId, draftId: draft.id })}>
      <Button variant="ghost" type="button" className="workspace-expand" aria-label={`${expandedNodes.has(node) ? '收起' : '展开'}${titledDraft.title}`} aria-expanded={expandedNodes.has(node)} disabled={!enabled || pending} onClick={() => setNodeOpen(node, !expandedNodes.has(node))}><Icon name="chevron" size={14}/></Button>
      <details open={expandedNodes.has(node)} className="workspace-folder workspace-topic">
        <summary title={titledDraft.title}
          data-tree-node={node} data-tree-parent={folderId ?? ''}
          aria-label={`${titledDraft.title}${selectedNodes.has(node) ? '，已选择' : ''}${selectedId === draft.id ? '，当前文章' : ''}`} data-current={selectedId === draft.id || undefined} data-drop-position={dropPosition(node)} data-selected={selectedNodes.has(node) || undefined}
          onClick={(event) => { event.preventDefault(); if (!enabled || pending) return; selectNode(event, node); if (!event.ctrlKey && !event.metaKey && !event.shiftKey) onOpen(draft, selectedId === draft.id ? selectedPlatform : draft.platforms[0]) }}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            openArticleMenu(titledDraft, event.clientX, event.clientY, event.currentTarget)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
              event.preventDefault()
              const rect = event.currentTarget.getBoundingClientRect()
              openArticleMenu(titledDraft, rect.left, rect.bottom, event.currentTarget)
            }
          }}
          >
          <Icon name="folder" size={16}/><span>{titledDraft.title}</span>
          {running && <small>生成中</small>}
          {needsAttention && <small>待处理</small>}
        </summary>
        <div className="workspace-children">{draft.platforms.map(platform => <Button variant="ghost" type="button" key={platform}
          className={`note-item ${selectedId === draft.id && selectedPlatform === platform ? 'active' : ''}`}
          disabled={!enabled || pending} onClick={() => { setSelectedNodes(new Set([node])); anchorNode.current = node; onOpen(draft, platform) }}
          aria-label={`${platform}：${platformTitles[`${draft.id}:${platform}`]?.value ?? titledDraft.title}`}
          aria-current={selectedId === draft.id && selectedPlatform === platform ? 'page' : undefined}>
          <img className="platform-logo" src={platformLogos[platform]} alt="" aria-hidden="true"/><span>{platformTitles[`${draft.id}:${platform}`]?.value ?? titledDraft.title}</span>
        </Button>)}</div>
      </details>
      <Button variant="ghost" type="button" className="tree-more" aria-label={`${titledDraft.title}的操作`}
        aria-expanded={articleMenu?.draft.id === draft.id} disabled={!enabled || pending}
        onContextMenu={event => { event.preventDefault(); event.stopPropagation(); openArticleMenu(titledDraft, event.clientX, event.clientY, event.currentTarget) }}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          openArticleMenu(titledDraft, rect.right, rect.bottom, event.currentTarget)
        }}>⋯</Button>
    </div>
  }
  function openMenu(folder: WorkspaceFolder, x: number, y: number, summary: HTMLElement) {
    if (!enabled || pending) return
    const node: WorkspaceNodeId = `folder:${folder.id}`
    if (!selectedNodes.has(node)) { setSelectedNodes(new Set([node])); anchorNode.current = node }
    menuSummaryRef.current = summary; restoreMenuFocus.current = true; setArticleMenu(null)
    setFolderMenu({ folder, x: Math.max(8, Math.min(x, window.innerWidth - 165)), y: Math.max(8, Math.min(y, window.innerHeight - 165)) })
  }
  function contextMenu(event: ReactMouseEvent<HTMLElement>, folder: WorkspaceFolder) {
    event.preventDefault(); event.stopPropagation(); openMenu(folder, event.clientX, event.clientY, event.currentTarget)
  }
  function folderEditor(): ReactNode {
    if (!editor) return null
    return <div className="workspace-name-editor"><form className="workspace-name-row" onSubmit={saveName}><Icon name="folder" size={16}/><Input appearance="embedded" aria-label={editor.type === 'create' ? '新建文件夹名称' : '重命名文件夹'} aria-describedby={message ? 'workspace-folder-error' : undefined} placeholder="未命名" autoFocus maxLength={100} value={name} disabled={pending || !enabled} onChange={(event) => { setName(event.target.value); if (message) setMessage('') }} onBlur={() => { void commitName() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelNameBlur.current = true; setEditor(null); setMessage(''); queueMicrotask(() => { cancelNameBlur.current = false }) } }} /></form>{message && <p id="workspace-folder-error" role="alert">{message}</p>}</div>
  }
  function treeChildren(parentId: string | null): ReactNode {
    return workspaceChildren(index, drafts, parentId).map(({ item, kind, id: node }) => {
      if (kind === 'article') return articleRow(item, parentId)
      const folder = item
      if (editor?.type === 'rename' && editor.folder.id === folder.id) return <div key={node}>{folderEditor()}</div>
      return <div className="workspace-folder-row" key={node}>
        <details open={expandedNodes.has(node)} className="workspace-folder" data-drop-folder={folder.id}>
          <summary title={`${folder.name}（右键操作）`}
            aria-label={`${folder.name}${selectedNodes.has(node) ? "，已选择" : ""}`} data-tree-node={node} data-tree-parent={parentId ?? ''} data-drop-position={dropPosition(node)} data-selected={selectedNodes.has(node) || undefined}
            className={dropMarker === `inside:${folder.id}` ? 'workspace-drop-target' : undefined}
            draggable={enabled && !pending}
            onDragStart={(event) => startDrag(event, { node, parentId })}
            aria-current={selectedFolderId === folder.id ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault()
              if (!enabled || pending) return
              selectNode(event, node)
              if (!event.ctrlKey && !event.metaKey && !event.shiftKey) { setNodeOpen(node, !expandedNodes.has(node)); onOpenFolder(folder.id) }
            }}
            onContextMenu={(event) => contextMenu(event, folder)}
            onKeyDown={(event) => {
              if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                event.preventDefault()
                const rect = event.currentTarget.getBoundingClientRect()
                openMenu(folder, rect.left, rect.bottom, event.currentTarget)
              }
            }}><Icon name={expandedNodes.has(node) ? "folderOpen" : "folder"} size={16}/><span>{folder.name}</span></summary>
          <div className="workspace-children">
            {editor?.type === 'create' && editor.parentId === folder.id && folderEditor()}
            {treeChildren(folder.id)}
          </div>
        </details>
        <Button variant="ghost" type="button" className="tree-more" aria-label={`${folder.name}的操作`} aria-expanded={folderMenu?.folder.id === folder.id}
          disabled={!enabled || pending} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); openMenu(folder, event.clientX, event.clientY, event.currentTarget) }} onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            openMenu(folder, rect.right, rect.bottom, event.currentTarget)
          }}>⋯</Button>
      </div>
    })
  }
  function closeMenu() { setFolderMenu(null); setArticleMenu(null) }
  const openAction = folderMenu ?? articleMenu
  const menuNode: WorkspaceNodeId | null = folderMenu ? `folder:${folderMenu.folder.id}` : articleMenu ? `article:${articleMenu.draft.id}` : null
  const batchMenu = !!menuNode && selectedNodes.size > 1 && selectedNodes.has(menuNode)
  function reorderMenu(node: WorkspaceNodeId, parentId: string | null) {
    const siblings = workspaceChildren(index, drafts, parentId)
    const position = siblings.findIndex(item => item.id === node)
    if (position < 0 || siblings.length < 2) return null
    const previous = siblings[position - 1]
    const next = siblings[position + 1]
    return <>
      <DropdownMenuItem disabled={!previous} onSelect={() => previous && void change({ type: 'reorder', parentId, node, target: previous.id, position: 'before' })}>上移</DropdownMenuItem>
      <DropdownMenuItem disabled={!next} onSelect={() => next && void change({ type: 'reorder', parentId, node, target: next.id, position: 'after' })}>下移</DropdownMenuItem>
    </>
  }
  return <div className="workspace-tree" ref={treeRoot} onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && event.target instanceof HTMLElement && event.target.matches('summary[data-tree-node]')) { event.preventDefault(); setSelectedNodes(new Set(visibleNodes())) }
    if (event.key === 'Escape' && !editor && !openAction && !deletePlan) { setSelectedNodes(new Set()); anchorNode.current = null }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodes.size && event.target instanceof HTMLElement && event.target.matches('summary[data-tree-node]')) { event.preventDefault(); void beginDelete([...selectedNodes]) }
  }}>
    <span className="sr-only" aria-live="polite">{selectedNodes.size > 1 ? `已选择 ${selectedNodes.size} 项` : ''}</span>
    {deletePlan && <div className="workspace-inline-form" role="group" aria-label="确认永久删除"><p>永久删除{[deletePlan.folderIds.length ? `${deletePlan.folderIds.length} 个文件夹` : '', deletePlan.articleIds.length ? `${deletePlan.articleIds.length} 篇文章` : ''].filter(Boolean).join('和')}？{deletePlan.articleIds.length > 0 && '文章的正文、配图及来源都会删除。'}此操作无法恢复。</p><div><Button variant="destructive" type="button" disabled={!enabled || pending} onClick={() => void deleteSelection()}>永久删除</Button><Button variant="ghost" type="button" autoFocus disabled={!enabled || pending} onClick={() => setDeletePlan(null)}>取消</Button></div></div>}
    {editor?.type === 'create' && editor.parentId === null && folderEditor()}{message && !editor && <p role="alert">{message}</p>}<div className={`workspace-root ${dropMarker === 'inside:' ? 'workspace-drop-target' : ''}`} data-drop-folder=""
      onClick={event => { if (event.target === event.currentTarget || (event.target instanceof HTMLElement && event.target.classList.contains('workspace-root-drop'))) { setSelectedNodes(new Set()); anchorNode.current = null } }}
      onDragOver={dragOver} onDragEnd={endDrag} onDrop={drop}
      onDragLeave={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropMarker(null) }}>
      {treeChildren(null)}<div className="workspace-root-drop" aria-hidden="true" /></div>{openAction && <DropdownMenu open modal={false} onOpenChange={open => { if (!open) closeMenu() }}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden="true" className="workspace-menu-anchor" style={{ left: openAction.x, top: openAction.y }}/>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={0} className="workspace-action-menu"
        aria-label={batchMenu ? `${selectedNodes.size} 个所选项目的操作` : `${folderMenu?.folder.name ?? articleMenu?.draft.title}的操作`}
        onCloseAutoFocus={event => {
          event.preventDefault()
          const trigger = menuSummaryRef.current
          if (restoreMenuFocus.current) {
            if (trigger instanceof HTMLButtonElement && trigger.disabled) trigger.parentElement?.querySelector('summary')?.focus()
            else trigger?.focus()
          }
        }}>
        {batchMenu && <>
          <DropdownMenuLabel>已选 {selectedNodes.size} 项</DropdownMenuLabel>
          <DropdownMenuSub><DropdownMenuSubTrigger>移动所选项目…</DropdownMenuSubTrigger><DropdownMenuSubContent className="workspace-action-menu">
            {[...selectedNodes].every(node => node.startsWith('folder:')) && <DropdownMenuItem onSelect={() => void moveSelection(null)}>根目录</DropdownMenuItem>}
            {index.folders.map(folder => <DropdownMenuItem key={folder.id} title={folderPath(folder)} disabled={selectedNodes.has(`folder:${folder.id}`) || hasSelectedAncestor(folder.parentId)} onSelect={() => void moveSelection(folder.id)}><span className="truncate">{folderPath(folder)}</span></DropdownMenuItem>)}
          </DropdownMenuSubContent></DropdownMenuSub>
          <DropdownMenuItem variant="destructive" onSelect={() => { restoreMenuFocus.current = false; void beginDelete([...selectedNodes]) }}>删除所选项目…</DropdownMenuItem>
        </>}
        {!batchMenu && folderMenu && <>
          {reorderMenu(`folder:${folderMenu.folder.id}`, folderMenu.folder.parentId)}
          <DropdownMenuItem onSelect={() => {
            restoreMenuFocus.current = false
            setNodeOpen(`folder:${folderMenu.folder.id}`, true)
            onCreateArticle(folderMenu.folder.id)
          }}>新建文章</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => {
            restoreMenuFocus.current = false
            setNodeOpen(`folder:${folderMenu.folder.id}`, true)
            beginCreate(folderMenu.folder.id)
          }}>新建子文件夹</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => {
            restoreMenuFocus.current = false
            beginRename(folderMenu.folder)
          }}>重命名</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => {
            setEditor(null); setMessage(''); void beginDelete([`folder:${folderMenu.folder.id}`])
          }}>删除文件夹</DropdownMenuItem>
        </>}
        {!batchMenu && articleMenu && <>
          {reorderMenu(`article:${articleMenu.draft.id}`, index.assignments[articleMenu.draft.id] ?? null)}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>移动到…</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="workspace-action-menu">
              <DropdownMenuLabel>移动到</DropdownMenuLabel>
              {index.folders.map(folder => <DropdownMenuItem key={folder.id} title={folderPath(folder)}
                disabled={index.assignments[articleMenu.draft.id] === folder.id}
                onSelect={() => void change({ type: 'moveDraft', draftId: articleMenu.draft.id, folderId: folder.id })}>
                <span className="truncate">{folderPath(folder)}</span>
              </DropdownMenuItem>)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem variant="destructive" onSelect={() => {
            restoreMenuFocus.current = false
            setEditor(null); setMessage(''); void beginDelete([`article:${articleMenu.draft.id}`])
          }}>删除文章</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>}
  </div>
}
