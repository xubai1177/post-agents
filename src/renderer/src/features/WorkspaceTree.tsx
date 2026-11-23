import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import type { ArticleRun, Draft, Platform } from '../../../shared/drafts'
import type { WorkspaceChange, WorkspaceFolder, WorkspaceIndex } from '../../../shared/workspace'
import { Icon } from '../components/Icon'
import { platformLogos } from './platform-logos'

type Props = { drafts: Draft[]; articleRuns: ArticleRun[]; selectedId: string; selectedPlatform: Platform; platformTitles: Record<string, { value: string }>; enabled: boolean; refreshKey: number; createRequest: number; onOpen: (draft: Draft, platform: Platform) => void; onCreateArticle: (folderId: string) => void; onDeleteArticle: (draft: Draft) => Promise<boolean> }
type Editor = { type: 'create'; parentId: string | null } | { type: 'rename'; folder: WorkspaceFolder }
export function WorkspaceTree({ drafts, articleRuns, selectedId, selectedPlatform, platformTitles, enabled, refreshKey, createRequest, onOpen, onCreateArticle, onDeleteArticle }: Props) {
  const [index, setIndex] = useState<WorkspaceIndex>({ version: 1, folders: [], assignments: {}, titles: {}, imageStyles: {} })
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [name, setName] = useState('')
  const [removing, setRemoving] = useState<WorkspaceFolder | null>(null)
  const [removingArticle, setRemovingArticle] = useState<Draft | null>(null)
  const [pending, setPending] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [folderMenu, setFolderMenu] = useState<{ folder: WorkspaceFolder; x: number; y: number } | null>(null)
  const [articleMenu, setArticleMenu] = useState<{ draft: Draft; x: number; y: number } | null>(null)
  const restoreMenuFocus = useRef(true)
  const menuSummaryRef = useRef<HTMLElement | null>(null)
  const lastCreateRequest = useRef(createRequest)
  const savingName = useRef(false)
  const cancelNameBlur = useRef(false)
  useEffect(() => {
    if (lastCreateRequest.current !== createRequest && !pending) { lastCreateRequest.current = createRequest; setMessage(''); setRemoving(null); setName(''); setEditor({ type: 'create', parentId: null }) }
  }, [createRequest, pending])
  useEffect(() => {
    let active = true
    setQuery(''); setEditor(null); setRemoving(null); setRemovingArticle(null); setFolderMenu(null); setArticleMenu(null); setMessage('')
    void window.workspaceApi.read().then((result) => {
      if (!active) return
      if (result.ok) setIndex(result.value)
      else { setIndex({ version: 1, folders: [], assignments: {}, titles: {}, imageStyles: {} }); setMessage(result.error) }
    }).catch(() => { if (active) setMessage('无法读取目录。') })
    return () => { active = false }
  }, [refreshKey])
  async function change(value: WorkspaceChange): Promise<boolean> {
    if (pending) return false
    setPending(true)
    try { const result = await window.workspaceApi.change(value); if (result.ok) { setIndex(result.value); setMessage(''); return true } setMessage(result.error); return false }
    catch { setMessage('目录操作失败。'); return false } finally { setPending(false) }
  }
  function beginCreate(parentId: string | null) { setMessage(''); setRemoving(null); setName(''); setEditor({ type: 'create', parentId }) }
  function beginRename(folder: WorkspaceFolder) { setMessage(''); setRemoving(null); setName(folder.name); setEditor({ type: 'rename', folder }) }
  async function commitName() {
    if (!editor || savingName.current || cancelNameBlur.current) return
    if (!name.trim()) { setEditor((current) => current === editor ? null : current); setMessage(''); return }
    const value: WorkspaceChange = editor.type === 'create' ? { type: 'create', name, parentId: editor.parentId } : { type: 'rename', name, id: editor.folder.id }
    savingName.current = true
    try { if (await change(value)) setEditor((current) => current === editor ? null : current) } finally { savingName.current = false }
  }
  function saveName(event: FormEvent) { event.preventDefault(); void commitName() }
  async function remove() { if (removing && await change({ type: 'delete', id: removing.id })) setRemoving(null) }
  async function removeArticle() { if (removingArticle && await onDeleteArticle(removingArticle)) setRemovingArticle(null) }
  function dragOver(event: DragEvent, target: string) {
    if (!enabled || pending || !event.dataTransfer.types.includes('application/x-post-agents-draft')) return
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; setDropTarget(target)
  }
  function drop(event: DragEvent, folderId: string | null) {
    event.preventDefault(); event.stopPropagation(); setDropTarget(null)
    if (!enabled || pending) return
    const draftId = event.dataTransfer.getData('application/x-post-agents-draft')
    if (draftId && (index.assignments[draftId] ?? null) !== folderId) void change({ type: 'moveDraft', draftId, folderId })
  }
  function folderPath(folder: WorkspaceFolder): string {
    const names = [folder.name]; let parentId = folder.parentId
    while (parentId) { const parent = index.folders.find((item) => item.id === parentId); if (!parent) break; names.unshift(parent.name); parentId = parent.parentId }
    return names.join(' / ')
  }
  function openArticleMenu(draft: Draft, x: number, y: number, element: HTMLElement) {
    if (!enabled || pending) return
    menuSummaryRef.current = element; restoreMenuFocus.current = true; setFolderMenu(null)
    setArticleMenu({ draft, x: Math.max(8, Math.min(x, window.innerWidth - 225)), y: Math.max(8, Math.min(y, window.innerHeight - 230)) })
  }
  function items(folderId: string | null, matches?: Draft[]) {
    const rows = matches ?? drafts.filter((draft) => (index.assignments[draft.id] ?? null) === folderId)
    return rows.map((draft) => {
      const titledDraft = { ...draft, title: index.titles[draft.id] ?? draft.title }
      const run = articleRuns.find(item => item.id === draft.id)
      const running = run && (run.status === 'queued' || run.status === 'running')
      const needsAttention = run && ['failed', 'waiting', 'interrupted'].includes(run.status)
      return <div className="workspace-draft" key={draft.id} draggable={enabled && !pending && !matches}
        onDragStart={(event) => {
          event.dataTransfer.setData('application/x-post-agents-draft', draft.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => setDropTarget(null)}>
        <details open className="workspace-folder workspace-topic">
        <summary title={titledDraft.title}
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
          disabled={!enabled || pending} onClick={() => onOpen(draft, platform)}
          aria-label={`${platform}：${platformTitles[`${draft.id}:${platform}`]?.value ?? titledDraft.title}`}
          aria-current={selectedId === draft.id && selectedPlatform === platform ? 'page' : undefined}>
          <img className="platform-logo" src={platformLogos[platform]} alt="" aria-hidden="true"/><span>{platformTitles[`${draft.id}:${platform}`]?.value ?? titledDraft.title}</span>
        </Button>)}</div>
        </details>
        <Button variant="ghost" type="button" className="tree-more" aria-label={`${titledDraft.title}的操作`}
          aria-expanded={articleMenu?.draft.id === draft.id} disabled={!enabled || pending}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            openArticleMenu(titledDraft, rect.right, rect.bottom, event.currentTarget)
          }}>⋯</Button>
      </div>
    })
  }
  function openMenu(folder: WorkspaceFolder, x: number, y: number, summary: HTMLElement) {
    if (!enabled || pending) return
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
  function folders(parentId: string | null): ReactNode {
    return index.folders.filter((folder) => folder.parentId === parentId).map((folder) => editor?.type === 'rename' && editor.folder.id === folder.id ? <div key={folder.id}>{folderEditor()}</div> : <div className="workspace-folder-row" key={folder.id}><details open className={`workspace-folder ${dropTarget === folder.id ? 'workspace-drop-target' : ''}`} onDragOver={(event) => dragOver(event, folder.id)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null) }} onDrop={(event) => drop(event, folder.id)}><summary title={`${folder.name}（右键操作）`} onContextMenu={(event) => contextMenu(event, folder)} onKeyDown={(event) => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); openMenu(folder, rect.left, rect.bottom, event.currentTarget) } }}><Icon name="folder" size={16}/><span>{folder.name}</span></summary><div className="workspace-children">{editor?.type === 'create' && editor.parentId === folder.id && folderEditor()}{folders(folder.id)}{items(folder.id)}</div></details>
      <Button variant="ghost" type="button" className="tree-more" aria-label={`${folder.name}的操作`} aria-expanded={folderMenu?.folder.id === folder.id}
        disabled={!enabled || pending} onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          openMenu(folder, rect.right, rect.bottom, event.currentTarget)
        }}>⋯</Button>
    </div>)
  }
  function expandMenuFolder() {
    menuSummaryRef.current?.closest('.workspace-folder-row')?.querySelector('details')?.setAttribute('open', '')
  }
  function closeMenu() { setFolderMenu(null); setArticleMenu(null) }
  const openAction = folderMenu ?? articleMenu
  const search = query.trim().toLocaleLowerCase()
  const matches = search ? drafts.filter(draft => (index.titles[draft.id] ?? draft.title).toLocaleLowerCase().includes(search) || draft.platforms.some(platform => (platformTitles[`${draft.id}:${platform}`]?.value ?? '').toLocaleLowerCase().includes(search))) : null
  return <div className="workspace-tree">
    <Label className="workspace-search"><Icon name="search" size={16}/><Input appearance="embedded" type="search" aria-label="搜索文章标题" placeholder="搜索文章" value={query} onChange={event => setQuery(event.target.value)}/></Label>
    {editor?.type === 'create' && editor.parentId === null && folderEditor()}{removing && <div className="workspace-inline-form" role="group" aria-label="确认删除目录"><p>删除“{removing.name}”及其子目录？文章会移至根目录，文件不会删除。</p><div><Button variant="ghost" type="button" disabled={pending} onClick={() => void remove()}>确认删除</Button><Button variant="ghost" type="button" disabled={pending} onClick={() => setRemoving(null)}>取消</Button></div></div>}{removingArticle && <div className="workspace-inline-form" role="group" aria-label="确认删除文章"><p>永久删除“{removingArticle.title}”？该文章所有平台的正文、配图、来源及未保存修改都会删除，无法恢复。</p><div><Button variant="destructive" type="button" className="workspace-delete-button" disabled={!enabled || pending} onClick={() => void removeArticle()}>确认删除</Button><Button variant="ghost" type="button" autoFocus disabled={!enabled || pending} onClick={() => setRemovingArticle(null)}>取消</Button></div></div>}{message && !editor && <p role="alert">{message}</p>}<div className={`workspace-root ${dropTarget === 'root' ? 'workspace-drop-target' : ''}`} onDragOver={(event) => dragOver(event, 'root')} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null) }} onDrop={(event) => drop(event, null)}>{matches ? (
      matches.length ? items(null, matches) : <p className="tree-empty" role="status">未找到匹配的文章。</p>
    ) : <>{folders(null)}{items(null)}<div className="workspace-root-drop" aria-hidden="true" /></>}</div>{openAction && <DropdownMenu open modal={false} onOpenChange={open => { if (!open) closeMenu() }}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden="true" className="workspace-menu-anchor" style={{ left: openAction.x, top: openAction.y }}/>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={0} className="workspace-action-menu"
        aria-label={`${folderMenu?.folder.name ?? articleMenu?.draft.title}的操作`}
        onCloseAutoFocus={event => {
          event.preventDefault()
          if (restoreMenuFocus.current) menuSummaryRef.current?.focus()
        }}>
        {folderMenu && <>
          <DropdownMenuItem onSelect={() => {
            restoreMenuFocus.current = false
            expandMenuFolder()
            onCreateArticle(folderMenu.folder.id)
          }}>新建文章</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => {
            restoreMenuFocus.current = false
            expandMenuFolder()
            beginCreate(folderMenu.folder.id)
          }}>新建子文件夹</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => {
            restoreMenuFocus.current = false
            beginRename(folderMenu.folder)
          }}>重命名</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => {
            setEditor(null); setMessage(''); setRemoving(folderMenu.folder)
          }}>删除文件夹</DropdownMenuItem>
        </>}
        {articleMenu && <>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>移动到…</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="workspace-action-menu">
              <DropdownMenuLabel>移动到</DropdownMenuLabel>
              <DropdownMenuItem disabled={!index.assignments[articleMenu.draft.id]}
                onSelect={() => void change({ type: 'moveDraft', draftId: articleMenu.draft.id, folderId: null })}>根目录</DropdownMenuItem>
              {index.folders.map(folder => <DropdownMenuItem key={folder.id} title={folderPath(folder)}
                disabled={index.assignments[articleMenu.draft.id] === folder.id}
                onSelect={() => void change({ type: 'moveDraft', draftId: articleMenu.draft.id, folderId: folder.id })}>
                <span className="truncate">{folderPath(folder)}</span>
              </DropdownMenuItem>)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem variant="destructive" onSelect={() => {
            restoreMenuFocus.current = false
            setEditor(null); setRemoving(null); setMessage(''); setRemovingArticle(articleMenu.draft)
          }}>删除文章</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>}
  </div>
}
