import logoUrl from './assets/icon.png'
import { useConfirmDialog } from './components/ConfirmDialog'
import { useMessage } from './components/MessageProvider'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Alert } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState } from 'react'
import { platforms, type ArticleRun, type Draft, type Platform, type CreateRequest, type CreateResult } from '../../shared/drafts'
import { defaultImageStyle, type ImageStyle, type PlatformStyleSelections } from '../../shared/image-styles'
import type { GenerationProgress } from '../../shared/research'
import { Icon } from './components/Icon'
import { useAppearance } from './features/appearance'
import { Create, type CreateForm } from './features/Create'
import { Topics } from './features/Topics'
import { Discovery } from './features/Discovery'
import type { TopicCandidate, TopicBatch } from '../../shared/topics'
import { Detail } from './features/Detail'
import type { PlatformLink } from '../../shared/platform-links'
import { PlatformSettings } from './features/PlatformSettings'
import { Settings } from './features/Settings'
import { Documentation } from './features/Documentation'
import { useSoftwareUpdates, UpdateDialog, UpdateSettings } from './features/SoftwareUpdates'
import { prepareArticleOpen } from './features/reopen-article'
import { FolderContents } from './features/FolderContents'
import type { WorkspaceIndex } from '../../shared/workspace'
import { WorkspaceHome } from './features/WorkspaceHome'
import { WorkspaceTree } from './features/WorkspaceTree'
import { WorkspaceManager } from './features/WorkspaceManager'
import type { WorkspaceMenuAction } from '../../shared/workspace'
import { TaskPanel } from './features/TaskPanel'
import { visibleArticles } from './features/visible-articles'
import type { OpenDocument } from './features/types'

import { formatRoute, parseRoute, type Page } from './features/routes'


export default function App() {
  useAppearance()
  const { confirm, confirmation } = useConfirmDialog()
  const showMessage = useMessage()
  const updates = useSoftwareUpdates()
  const [createForm, setCreateForm] = useState<CreateForm>({ title: '', angle: '', audience: '', platforms: [...platforms], imageStyle: defaultImageStyle, generateImages: false })
  const [availablePlatforms, setAvailablePlatforms] = useState<Platform[]>([...platforms])
  function applyPlatformLinks(links: PlatformLink[]) { setAvailablePlatforms(platforms.filter(platform => links.some(link => link.name === platform && link.enabled !== false))) }
  useEffect(() => { void window.settingsApi.load().then(result => { if (result.ok) applyPlatformLinks(result.value.platformLinks); else showMessage(result.error, true) }).catch(() => showMessage('无法读取平台配置。', true)) }, [])
  const [createDirty, setCreateDirty] = useState(false)
  const [newFolderRequest, setNewFolderRequest] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [articleFolderId, setArticleFolderId] = useState<string | null>(null)
  const [treeVersion, setTreeVersion] = useState(0)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [folderIndex, setFolderIndex] = useState<WorkspaceIndex>({ version: 1, folders: [], assignments: {}, titles: {}, imageStyles: {} })
  const drawerOrigin = useRef<HTMLElement | null>(null)
  const newMenuRef = useRef<HTMLDivElement>(null)
  const [topicStatus, setTopicStatus] = useState('')
  const [batchBusy, setBatchBusy] = useState(false)
  const [page, setPage] = useState<Page>(() => parseRoute(window.location.hash).page)
  const [showHome, setShowHome] = useState(() => !window.location.hash)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [draftsReady, setDraftsReady] = useState(false)
  const [articleRuns, setArticleRuns] = useState<ArticleRun[]>([])
  const [runsLoaded, setRunsLoaded] = useState(false)
  const runsRef = useRef<ArticleRun[]>([])
  const articleRefreshId = useRef(0)
  const [selectedId, setSelectedId] = useState(() => parseRoute(window.location.hash).draftId)
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>(() => parseRoute(window.location.hash).platform ?? '小红书')
  const [documents, setDocuments] = useState<Record<string, OpenDocument>>({})
  const [platformTitles, setPlatformTitles] = useState<Record<string, { value: string; saved: string | null; fallback: string }>>({})
  const platformTitlesRef = useRef(platformTitles)
  function updatePlatformTitles(update: (current: typeof platformTitles) => typeof platformTitles) {
    const next = update(platformTitlesRef.current); platformTitlesRef.current = next; setPlatformTitles(next)
  }
  const documentsRef = useRef(documents)
  const openingArticle = useRef(false)
  function updateDocuments(update: (current: Record<string, OpenDocument>) => Record<string, OpenDocument>) {
    const next = update(documentsRef.current); documentsRef.current = next; setDocuments(next)
  }
  const [editorVersion, setEditorVersion] = useState(0)
  const [operationBusy, setOperationBusy] = useState(false)
  const [regeneratingKeys, setRegeneratingKeys] = useState<Set<string>>(() => new Set())
  const regeneratingRef = useRef(new Set<string>())
  const [regenerationVersions, setRegenerationVersions] = useState<Record<string, number>>({})
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [workspaces, setWorkspaces] = useState<{ current: string; recent: string[] }>({ current: '', recent: [] })
  const switchingWorkspace = useRef(false)
  const [workspaceAction, setWorkspaceAction] = useState<Exclude<WorkspaceMenuAction, 'open' | 'settings'> | null>(null)
  const [workspaceVersion, setWorkspaceVersion] = useState(0)
  const workspaceVersionRef = useRef(0)
  useEffect(() => {
    let active = true
    void window.workspaceApi.listWorkspaces().then(result => { if (active) { if (result.ok) setWorkspaces(result.value); else showMessage(result.error, true) } }).catch(() => { if (active) showMessage('无法读取工作区列表。', true) })
    return () => { active = false }
  }, [workspaceVersion])
  const [platformArticleStyles, setPlatformArticleStyles] = useState<Record<string, PlatformStyleSelections>>({})
  const [articleStyles, setArticleStyles] = useState<Record<string, ImageStyle>>({})
  const [articleTitles, setArticleTitles] = useState<Record<string, string>>({})
  const [researchFailed, setResearchFailed] = useState(false)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [imageProgress, setImageProgress] = useState('')
  const imageRunId = useRef('')
  const selectedDraft = drafts.find((draft) => draft.id === selectedId)
  const displayedDraft = selectedDraft ? { ...selectedDraft, title: articleTitles[selectedDraft.id] ?? selectedDraft.title } : undefined
  const dirty = Object.values(documents).some((doc) => doc.content !== doc.savedContent) || Object.values(platformTitles).some(title => title.value !== (title.saved ?? title.fallback))
  const docKey = `${selectedId}:${selectedPlatform}`
  const current = documents[docKey]
  async function refresh(preferredId?: string) {
    const workspace = workspaceVersionRef.current
    if (!window.draftsApi) { setStatus('请在桌面应用中使用本地文章。'); setLoading(false); return }
    try {
      const [result, runResult] = await Promise.all([window.draftsApi.list(), window.draftsApi.articleRuns()])
      if (workspace !== workspaceVersionRef.current) return
      if (!result.ok || !runResult.ok) { setDraftsReady(false); setStatus(!result.ok ? result.error : !runResult.ok ? runResult.error : '无法读取任务状态。'); return }
      setStatus(''); setDrafts(result.value); setDraftsReady(true)
      const visible = visibleArticles(result.value, runResult.value)
      const draft = visible.find((item) => item.id === preferredId) ?? visible.find((item) => item.id === selectedId) ?? visible[0]
      const nextPlatform = draft && draft.id === selectedId && draft.platforms.includes(selectedPlatform) ? selectedPlatform : draft?.platforms[0]
      setSelectedId(draft?.id ?? '')
      if (nextPlatform) setSelectedPlatform(nextPlatform)
      const route = parseRoute(window.location.hash)
      window.history.replaceState(null, '', formatRoute({ page: route.page, draftId: draft?.id ?? '', platform: nextPlatform ?? null }))
    } catch { if (workspace === workspaceVersionRef.current) { setDraftsReady(false); setStatus('无法读取工作区，请检查设置和目录权限。') } } finally { if (workspace === workspaceVersionRef.current) setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])
  function folderIdForCurrent(): string | null { return folderId ?? folderIndex.assignments[selectedId] ?? null }
  function openCreate(folderId: string | null, fromTopic = false) {
    drawerOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setCreateForm(current => ({ ...current, platforms: fromTopic ? current.platforms.filter(p => availablePlatforms.includes(p)) : createDirty ? current.platforms.filter(p => availablePlatforms.includes(p)) : [...availablePlatforms], generateImages: false, imageStyle: defaultImageStyle }))
    setArticleFolderId(folderId ?? (!fromTopic ? (folderIdForCurrent() ?? null) : null) ?? folderIndex.generationFolderId ?? folderIndex.defaultFolderId ?? null); setStatus(''); setResearchFailed(false); setDrawerOpen(true)
  }
  useEffect(() => {
    let active = true
    void window.workspaceApi.read().then((result) => { if (active) { setArticleTitles(result.ok ? result.value.titles : {}); setArticleStyles(result.ok ? result.value.imageStyles : {}); setPlatformArticleStyles(result.ok ? result.value.platformImageStylesByArticle ?? {} : {}) } }).catch(() => { if (active) { setArticleTitles({}); setArticleStyles({}); setPlatformArticleStyles({}) } })
    return () => { active = false }
  }, [workspaceVersion, treeVersion])
  useEffect(() => { if (!window.draftsApi) return; return window.draftsApi.onProgress(setProgress) }, [])
  useEffect(() => {
    let active = true
    let initialized = false
    setRunsLoaded(false)
    async function refreshRuns() {
      const sequence = ++articleRefreshId.current
      try {
        const result = await window.draftsApi.articleRuns()
        if (!active || sequence !== articleRefreshId.current) return
        if (!result.ok) { setRunsLoaded(false); setStatus(result.error); return }
        const changed = result.value.filter(run => ['done', 'failed', 'waiting', 'interrupted'].includes(run.status) && runsRef.current.find(old => old.id === run.id)?.status !== run.status)
        if (changed.length) {
          updateDocuments(all => { const next = { ...all }; for (const run of changed) for (const platform of platforms) { const key = `${run.id}:${platform}`, doc = next[key]; if (doc && doc.content === doc.savedContent) delete next[key] }; return next })
          updatePlatformTitles(all => { const next = { ...all }; for (const run of changed) for (const platform of platforms) { const key = `${run.id}:${platform}`, title = next[key]; if (title && title.value === (title.saved ?? title.fallback)) delete next[key] }; return next })
          setEditorVersion(value => value + 1)
        }
        const warnings = initialized ? result.value.filter(run => run.status === 'done' && run.message && runsRef.current.find(old => old.id === run.id)?.status !== 'done') : []
        if (warnings.length) showMessage(warnings.map(run => `${run.request.title}：${run.message}`).join('；'), true)
        const completed = initialized && result.value.some(run => run.status === 'done' && runsRef.current.find(old => old.id === run.id)?.status !== 'done')
        initialized = true
        runsRef.current = result.value; setArticleRuns(result.value); setRunsLoaded(true)
        if (completed) { const draftsResult = await window.draftsApi.list(); if (active && draftsResult.ok) setDrafts(draftsResult.value) }
      } catch { if (active) { setRunsLoaded(false); setStatus('无法读取文章生成状态，请检查工作区。') } }
    }
    const unsubscribe = window.draftsApi.onArticlesChanged(() => { void refreshRuns() })
    void refreshRuns()
    return () => { active = false; articleRefreshId.current++; unsubscribe() }
  }, [workspaceVersion, showMessage])
  useEffect(() => { if (!window.imagesApi) return; return window.imagesApi.onArticleProgress((event) => { if (event.runId === imageRunId.current) setImageProgress(event.message) }) }, [])
  useEffect(() => {
    if (!selectedDraft || current || !window.draftsApi) return
    let active = true
    void window.draftsApi.read(selectedId, selectedPlatform).then((result) => {
      if (!active) return
      if (!result.ok) { setStatus(result.error); return }
      updateDocuments((all) => ({ ...all, [docKey]: { ...result.value, savedContent: result.value.content } }))
    }).catch(() => { if (active) setStatus('无法读取文章。') })
    return () => { active = false }
  }, [selectedId, selectedPlatform, current, selectedDraft, docKey])
  useEffect(() => {
    let active = true
    const missing = drafts.flatMap(draft => draft.platforms.filter(platform => !platformTitlesRef.current[`${draft.id}:${platform}`]).map(platform => ({ draft, platform })))
    void Promise.all(missing.map(async ({ draft, platform }) => ({ draft, platform, result: await window.draftsApi.readTitle(draft.id, platform) }))).then(results => {
      if (!active) return
      let failed = false
      updatePlatformTitles(all => {
        const next = { ...all }
        for (const { draft, platform, result } of results) {
          const key = `${draft.id}:${platform}`
          if (!result.ok) { failed = true; continue }
          if (!next[key]) { const fallback = articleTitles[draft.id] ?? draft.title; next[key] = { value: result.value ?? fallback, saved: result.value, fallback } }
        }
        return next
      })
      if (failed) setStatus('部分文章标题无法读取，请检查工作区。')
    }).catch(() => { if (active) setStatus('无法读取文章标题，请检查工作区。') })
    return () => { active = false }
  }, [drafts, articleRuns, articleTitles, workspaceVersion])
  useEffect(() => {
    if (!selectedDraft || platformTitles[docKey]) return
    let active = true
    void window.draftsApi.readTitle(selectedId, selectedPlatform).then(result => {
      if (!active) return
      if (!result.ok) { setStatus(result.error); return }
      updatePlatformTitles(all => all[docKey] ? all : { ...all, [docKey]: { value: result.value ?? (articleTitles[selectedId] ?? selectedDraft.title), saved: result.value, fallback: articleTitles[selectedId] ?? selectedDraft.title } })
    }).catch(() => { if (active) setStatus('无法读取平台标题。') })
    return () => { active = false }
  }, [selectedId, selectedPlatform, selectedDraft, docKey, platformTitles, articleTitles])
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
  async function openDraft(draft: Draft, requestedPlatform?: Platform, fromHistory = false): Promise<boolean> {
    if (busy || openingArticle.current) return false
    if (!await discardCurrentDocument()) return false
    openingArticle.current = true; setOperationBusy(true); setStatus('')
    try {
      await prepareArticleOpen(selectedId, draft, { getDocuments: () => documentsRef.current, updateDocuments, save: window.draftsApi.save, read: window.draftsApi.read, isLocked: key => regeneratingRef.current.has(`${workspaceVersionRef.current}:${key}`) })
      const nextPlatform = requestedPlatform && draft.platforms.includes(requestedPlatform) ? requestedPlatform : draft.id === selectedId && draft.platforms.includes(selectedPlatform) ? selectedPlatform : draft.platforms[0]
      setShowHome(false); setFolderId(null); setSelectedId(draft.id); setSelectedPlatform(nextPlatform); setEditorVersion((value) => value + 1)
      if (!fromHistory) navigate('detail', draft.id, nextPlatform)
      return true
    } catch (error) { setStatus(error instanceof Error ? error.message : '无法保存或重新读取文章，请检查工作区后重试。'); return false }
    finally { openingArticle.current = false; setOperationBusy(false) }
  }
  async function deleteNodes(plan: import('../../shared/workspace').DeleteNodesPlan): Promise<import('../../shared/workspace').DeleteNodesResult | null> {
    if (busy || openingArticle.current) return null
    if (plan.articleIds.some(id => platforms.some(platform => regeneratingRef.current.has(`${workspaceVersionRef.current}:${id}:${platform}`)))) { showMessage('所选内容中有文章正在重新生成，请完成后重试。', true); return null }
    const unsaved = plan.articleIds.some(id => platforms.some(platform => {
      const key = `${id}:${platform}`, doc = documentsRef.current[key], title = platformTitlesRef.current[key]
      return (doc && doc.content !== doc.savedContent) || (title && title.value !== (title.saved ?? title.fallback))
    }))
    if (unsaved) { showMessage('所选内容中有未保存的修改，请先保存后再删除。', true); return null }
    setOperationBusy(true); setStatus('')
    try {
      const result = await window.workspaceApi.deleteNodes(plan)
      if (!result.ok) { showMessage(result.error, true); return null }
      const { deletedArticleIds, deletedFolderIds, errors, index } = result.value
      const deleted = new Set(deletedArticleIds), remaining = drafts.filter(item => !deleted.has(item.id))
      updateDocuments(all => Object.fromEntries(Object.entries(all).filter(([key]) => !deletedArticleIds.some(id => platforms.some(platform => key === `${id}:${platform}`)))))
      updatePlatformTitles(all => Object.fromEntries(Object.entries(all).filter(([key]) => !deletedArticleIds.some(id => platforms.some(platform => key === `${id}:${platform}`)))))
      setDrafts(remaining); setArticleTitles(index.titles); setArticleStyles(index.imageStyles); setPlatformArticleStyles(index.platformImageStylesByArticle ?? {}); setTreeVersion(value => value + 1)
      if (folderId && deletedFolderIds.includes(folderId)) setFolderId(null)
      if (deleted.has(selectedId)) { const next = visibleArticles(remaining, articleRuns)[0]; setSelectedId(next?.id ?? ''); if (next) setSelectedPlatform(next.platforms[0]); replaceRoute(page, next?.id ?? '', next?.platforms[0] ?? null); setEditorVersion(value => value + 1) }
      if (errors.length) showMessage(`已删除 ${deletedArticleIds.length} 篇文章、${deletedFolderIds.length} 个文件夹。${errors.join('；')}`, true)
      else showMessage(`已删除 ${deletedArticleIds.length} 篇文章、${deletedFolderIds.length} 个文件夹。`)
      return result.value
    } catch { showMessage('删除失败，请检查工作区后重试。', true); return null }
    finally { setOperationBusy(false) }
  }
  async function createDraft(request: CreateRequest, blank = false): Promise<CreateResult | null> {
    if (!articleFolderId) { setStatus('请选择保存文件夹。'); return null }
    setOperationBusy(true); setStatus(''); setResearchFailed(false); setProgress(null); setImageProgress('')
    try {
      if (!blank) {
        if (page === 'detail' && !(await discardCurrentDocument())) return null
        const queued = await window.draftsApi.startArticle({ request, imageStyle: createForm.imageStyle, imageStylesByPlatform: createForm.imageStylesByPlatform, generateImages: createForm.generateImages, folderId: articleFolderId })
        if (!queued.ok) { setStatus(queued.error); return null }
        await refresh()
        setCreateDirty(false); setCreateForm({ title: '', angle: '', audience: '', platforms: [...platforms], imageStyle: defaultImageStyle, generateImages: false }); setArticleFolderId(null); setTreeVersion(value => value + 1)
        setDrawerOpen(false); navigate('tasks'); if (queued.value.warning) showMessage(queued.value.warning, true); else showMessage('文章任务已加入队列。')
        return { draft: queued.value.draft, failures: [] }
      }
      const result = blank ? await window.draftsApi.createBlank(request) : await window.draftsApi.generate(request)
      if (!result.ok) { setStatus(result.error); setResearchFailed(result.code === 'RESEARCH_UNAVAILABLE'); return null }
      let styleWarning = ''
      if (result.value.draft) {
        try { const styled = await window.workspaceApi.change({ type: 'setImageStyle', draftId: result.value.draft.id, style: createForm.imageStyle }); if (styled.ok) setArticleStyles(styled.value.imageStyles); else styleWarning = '文章已创建，但图片风格保存失败，可在生成图片时重新选择。' }
        catch { styleWarning = '文章已创建，但图片风格保存失败，可在生成图片时重新选择。' }
      }
      let folderWarning = ''
      if (result.value.draft && articleFolderId) {
        try { const moved = await window.workspaceApi.change({ type: 'moveDraft', draftId: result.value.draft.id, folderId: articleFolderId }); if (!moved.ok) folderWarning = `文章已创建在根目录，移动到文件夹失败：${moved.error}` }
        catch { folderWarning = '文章已创建在根目录，移动到文件夹失败。' }
        setTreeVersion((value) => value + 1)
      }
      let imageMessages: string[] = []
      if (result.value.draft && createForm.generateImages && !blank) {
        const runId = crypto.randomUUID(); imageRunId.current = runId
        try {
          const images = await window.imagesApi.generateForArticle({ id: result.value.draft.id, platforms: result.value.draft.platforms, style: createForm.imageStyle, imageStylesByPlatform: createForm.imageStylesByPlatform, runId })
          imageMessages = images.ok ? images.value : [`文章已保存，配图生成失败：${images.error}`]
        } catch { imageMessages = ['文章已保存，配图生成失败，请检查图片服务。'] }
        finally { imageRunId.current = '' }
      }
      await refresh(result.value.draft?.id)
      if (result.value.draft) { setCreateDirty(false); setCreateForm({ title: '', angle: '', audience: '', platforms: [...platforms], imageStyle: defaultImageStyle, generateImages: false }); setArticleFolderId(null); setSelectedId(result.value.draft.id); setSelectedPlatform(result.value.draft.platforms[0]); navigate('detail', result.value.draft.id, result.value.draft.platforms[0]); setDrawerOpen(false) }
      const notes = [...(result.value.failures.length ? [`以下平台生成或保存失败：${result.value.failures.map((item) => item.platform).join('、')}。`] : [blank ? '空白文章已创建。' : '文案已生成并保存，请人工核查事实后使用。']), ...(result.value.warnings ?? []), ...(folderWarning ? [folderWarning] : []), ...(styleWarning ? [styleWarning] : []), ...imageMessages]
      setStatus(notes.join(' '))
      return result.value
    } catch { setStatus('生成失败，请检查模型服务和目录。'); return null } finally { setOperationBusy(false); setProgress(null); setImageProgress('') }
  }
  async function retryArticle(id: string, skipResearch: boolean) {
    try { const result = await window.draftsApi.retryArticle(id, skipResearch); if (!result.ok) setStatus(result.error) }
    catch { setStatus('无法重试文章生成，请检查工作区。') }
  }
  async function saveImageStyle(id: string, platform: Platform, style: ImageStyle): Promise<string | null> {
    try { const result = await window.workspaceApi.change({ type: 'setImageStyle', draftId: id, platform, style }); if (!result.ok) return result.error; setArticleStyles(result.value.imageStyles); setPlatformArticleStyles(result.value.platformImageStylesByArticle ?? {}); return null }
    catch { return '无法保存图片风格，请重试。' }
  }
  const pendingTitleSaves = useRef(new Map<string, Promise<boolean>>())
  async function savePlatformHeading(id: string, platform: Platform): Promise<boolean> {
    const key = `${id}:${platform}`, ongoing = pendingTitleSaves.current.get(key)
    if (ongoing) { if (!await ongoing) return false; return savePlatformHeading(id, platform) }
    const item = platformTitlesRef.current[key]
    if (!item || item.value === (item.saved ?? item.fallback)) return true
    if (!item.value.trim()) { setStatus('平台标题不能为空。'); return false }
    const snapshot = item.value.trim()
    const work = (async () => {
      try {
        const result = await window.draftsApi.saveTitle(id, platform, snapshot, item.saved)
        if (!result.ok) { setStatus(`标题自动保存失败：${result.error}`); return false }
        updatePlatformTitles(all => { const latest = all[key]; return latest ? { ...all, [key]: { ...latest, value: latest.value === item.value ? snapshot : latest.value, saved: snapshot } } : all })
        return true
      } catch { setStatus('标题自动保存失败，请检查目录权限。'); return false }
    })()
    pendingTitleSaves.current.set(key, work)
    try { return await work } finally { if (pendingTitleSaves.current.get(key) === work) pendingTitleSaves.current.delete(key) }
  }
  const pendingSaves = useRef(new Map<string, Promise<boolean>>())
  async function saveDocument(id: string, platform: Platform): Promise<boolean> {
    const key = `${id}:${platform}`
    const ongoing = pendingSaves.current.get(key)
    if (ongoing) { if (!await ongoing) return false; return saveDocument(id, platform) }
    const doc = documentsRef.current[key]
    if (!doc || doc.content === doc.savedContent) return true
    const snapshot = doc.content
    const work = (async () => {
      try {
        const result = await window.draftsApi.save(id, platform, snapshot, doc.version)
        if (!result.ok) { setStatus(`自动保存失败：${result.error}`); return false }
        updateDocuments(all => { const latest = all[key]; return latest ? { ...all, [key]: { ...latest, savedContent: snapshot, version: result.value.version } } : all })
        return true
      } catch { setStatus('自动保存失败，请检查目录权限后重试。'); return false }
    })()
    pendingSaves.current.set(key, work)
    try { return await work } finally { if (pendingSaves.current.get(key) === work) pendingSaves.current.delete(key) }
  }
  async function regenerateCurrent() {
    const id = selectedId, platform = selectedPlatform, key = `${id}:${platform}`, workspace = workspaceVersionRef.current, jobKey = `${workspace}:${key}`
    if (regeneratingRef.current.has(jobKey)) return
    if (!platformTitlesRef.current[key]?.value.trim()) { showMessage('请先填写平台标题。', true); return }
    regeneratingRef.current.add(jobKey); setRegeneratingKeys(new Set(regeneratingRef.current))
    try {
      if (!await savePlatformHeading(id, platform) || workspaceVersionRef.current !== workspace || !await saveDocument(id, platform) || workspaceVersionRef.current !== workspace) return
      const heading = platformTitlesRef.current[key], doc = documentsRef.current[key]
      if (!heading || !doc) { showMessage('无法读取当前文章，请重新打开后重试。', true); return }
      const result = await window.draftsApi.regenerate({ id, platform, title: heading.value.trim(), storedTitle: heading.saved, version: doc.version })
      if (workspaceVersionRef.current !== workspace) return
      if (!result.ok) { showMessage(result.error, true); return }
      updateDocuments(all => ({ ...all, [key]: { content: result.value.document.content, savedContent: result.value.document.content, version: result.value.document.version } }))
      setRegenerationVersions(all => ({ ...all, [key]: (all[key] ?? 0) + 1 }))
      showMessage(result.value.warnings.length ? `文章已重新生成。${result.value.warnings.join('；')}` : '文章已重新生成。', result.value.warnings.length > 0)
    } catch { if (workspaceVersionRef.current === workspace) showMessage('重新生成失败，请检查模型服务和网络连接。', true) }
    finally { regeneratingRef.current.delete(jobKey); setRegeneratingKeys(new Set(regeneratingRef.current)) }
  }
  const visibleDrafts = runsLoaded ? visibleArticles(drafts, articleRuns) : []
  const busy = operationBusy || batchBusy
  const selectedRun = articleRuns.find(run => run.id === selectedId)
  const generatingArticle = selectedRun?.status === 'queued' || selectedRun?.status === 'running'
  const regeneratingHere = regeneratingKeys.has(`${workspaceVersion}:${docKey}`)
  useEffect(() => {
    if (!platformTitles[docKey] || operationBusy || batchBusy || generatingArticle || regeneratingHere) return
    const timer = window.setTimeout(() => { void savePlatformHeading(selectedId, selectedPlatform) }, 800)
    return () => window.clearTimeout(timer)
  }, [docKey, platformTitles, operationBusy, batchBusy, selectedId, selectedPlatform, generatingArticle, regeneratingHere])
  useEffect(() => {
    if (!current || current.content === current.savedContent || operationBusy || batchBusy || generatingArticle || regeneratingHere) return
    const timer = window.setTimeout(() => { void saveDocument(selectedId, selectedPlatform) }, 800)
    return () => window.clearTimeout(timer)
  }, [selectedId, selectedPlatform, current, operationBusy, batchBusy, generatingArticle])
  function replaceRoute(next: Page, draftId: string, platform: Platform | null) {
    window.history.replaceState(null, '', formatRoute({ page: next, draftId, platform }))
  }
  function navigate(next: Page, draftId = selectedId, platform: Platform | null = selectedId ? selectedPlatform : null) {
    setShowHome(false)
    const hash = formatRoute({ page: next, draftId, platform })
    if (window.location.hash !== hash) window.history.pushState(null, '', hash)
    if (next !== page) setStatus('')
    setPage(next)
  }
  async function discardCurrentDocument(): Promise<boolean> {
    while (platformTitlesRef.current[docKey] && platformTitlesRef.current[docKey].value !== (platformTitlesRef.current[docKey].saved ?? platformTitlesRef.current[docKey].fallback)) if (!await savePlatformHeading(selectedId, selectedPlatform)) return false
    while (documentsRef.current[docKey] && documentsRef.current[docKey].content !== documentsRef.current[docKey].savedContent) if (!await saveDocument(selectedId, selectedPlatform)) return false
    return true
  }
  useEffect(() => {
    async function onPopState() {
      const route = parseRoute(window.location.hash)
      setShowHome(false)
      const restore = () => { window.history.pushState(null, '', formatRoute({ page, draftId: selectedId, platform: selectedId ? selectedPlatform : null })) }
      if (busy || openingArticle.current) {
        restore(); return
      }
      const draft = visibleDrafts.find((item) => item.id === route.draftId) ?? visibleDrafts.find((item) => item.id === selectedId) ?? visibleDrafts[0]
      const nextPlatform = draft && route.platform && draft.platforms.includes(route.platform) ? route.platform : draft?.platforms[0]
      if (page === 'detail' && (route.page !== 'detail' || (draft?.id === selectedId && nextPlatform !== selectedPlatform)) && !(await discardCurrentDocument())) { restore(); return }
      if (draft && draft.id !== selectedId && !(await openDraft(draft, nextPlatform, true))) { restore(); return }
      if (draft) { setSelectedId(draft.id); if (nextPlatform) setSelectedPlatform(nextPlatform) }
      else setSelectedId('')
      if (route.page !== page) setStatus('')
      setPage(route.page)
      replaceRoute(route.page, draft?.id ?? '', nextPlatform ?? null)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [page, busy, dirty, topicStatus, drafts, articleRuns, runsLoaded, selectedId, selectedPlatform])
  function workspaceChanged() {
    setFolderId(null); workspaceVersionRef.current += 1; runsRef.current = []; setArticleRuns([]); setDrafts([]); setDraftsReady(false); setRunsLoaded(false); setRegenerationVersions({}); updateDocuments(() => ({})); updatePlatformTitles(() => ({})); setArticleTitles({}); setArticleStyles({}); setPlatformArticleStyles({}); setTopicStatus(''); setCreateForm({ title: '', angle: '', audience: '', platforms: [...platforms], imageStyle: defaultImageStyle, generateImages: false }); setCreateDirty(false); setDrawerOpen(false); setWorkspaceVersion(value => value + 1)
    setSelectedId(''); navigate('detail', '', null); void refresh()
  }
  async function beforeWorkspaceSwitch() {
    if (busy || topicStatus === '选题生成中' || articleRuns.some(run => run.status === 'queued' || run.status === 'running') || regeneratingRef.current.size) { showMessage('任务进行中，请完成后再切换工作区。', true); return false }
    if (page === 'detail' && !(await discardCurrentDocument())) return false
    if (page !== 'settings' && !createDirty) return true
    return confirm({ title: '切换工作区？', message: '未保存的设置和创作表单会丢弃。', action: '继续切换' })
  }
  async function switchRecentWorkspace(directory: string) {
    if (directory === workspaces.current || switchingWorkspace.current) return
    switchingWorkspace.current = true
    try {
      if (!await beforeWorkspaceSwitch()) return
      const result = await window.workspaceApi.switchWorkspace(directory)
      if (!result.ok) showMessage(result.error, true)
      else workspaceChanged()
    } catch { showMessage('无法切换工作区，请重试。', true) } finally { switchingWorkspace.current = false }
  }
  const workspaceName = (directory: string) => directory.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || directory
  const workspaceMenuHandler = useRef<(action: WorkspaceMenuAction) => void>(() => {})
  workspaceMenuHandler.current = action => {
    if (action === 'settings') { if (!busy) void openSettings(); return }
    if (action !== 'open') { setWorkspaceAction(action); return }
    void (async () => {
      if (!await beforeWorkspaceSwitch()) return
      try {
        const result = await window.workspaceApi.open()
        if (!result.ok) showMessage(result.error, true)
        else if (result.value) workspaceChanged()
      } catch { showMessage('无法打开工作区，请重试。', true) }
    })()
  }
  useEffect(() => window.workspaceApi.onMenuAction(action => workspaceMenuHandler.current(action)), [])
  async function openSettings() {
    if (page === 'detail' && !(await discardCurrentDocument())) return
    setStatus(''); navigate('settings')
  }
  async function chooseTopic(candidate: TopicCandidate, batch: TopicBatch) {
    if (busy) return
    if (createDirty && !(await confirm({
      title: '用新选题替换表单？',
      message: '新选题会覆盖当前表单的主题、角度、受众和平台。',
      action: '替换表单',
    }))) return
    setCreateForm({ title: candidate.title, angle: candidate.angle, audience: batch.request.audience, platforms: [...batch.request.platforms], imageStyle: defaultImageStyle, generateImages: false, reference: { skipped: batch.skipped, sources: batch.sources } })
    setCreateDirty(false); openCreate(null, true)
  }
  return <div className="app-shell notes-shell"><header className="window-toolbar"><div className="window-toolbar-brand"><img src={logoUrl} alt=""/><strong>灵稿 AI</strong></div><DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" type="button" className="workspace-switcher" aria-label={workspaces.current ? `切换工作区，当前：${workspaceName(workspaces.current)}` : '选择工作区'} title={workspaces.current || undefined}>
        <span className="workspace-switcher-name">{workspaces.current ? workspaceName(workspaces.current) : '选择工作区'}</span><Icon name="down" size={14} className="workspace-switcher-chevron"/>
      </Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="workspace-switcher-menu">
        {workspaces.recent.length > 0 && <DropdownMenuLabel className="workspace-switcher-label">工作区</DropdownMenuLabel>}
        {workspaces.recent.map(directory => <DropdownMenuItem key={directory} onSelect={() => void switchRecentWorkspace(directory)} aria-current={directory === workspaces.current ? 'true' : undefined} title={directory} className="workspace-switcher-item">
          <Icon name="folder" size={16} className="workspace-switcher-item-icon"/><span className="workspace-switcher-item-text"><strong>{workspaceName(directory)}</strong><small>{directory}</small></span>{directory === workspaces.current && <Icon name="check" size={16} className="workspace-switcher-check"/>}
        </DropdownMenuItem>)}
        {workspaces.recent.length > 0 && <DropdownMenuSeparator/>}
        <DropdownMenuItem className="workspace-switcher-open" onSelect={() => workspaceMenuHandler.current('open')}><Icon name="plus" size={16}/>打开其他工作区…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu><div className="window-toolbar-actions"><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" type="button" aria-label="任务面板" aria-current={page === 'tasks' ? 'page' : undefined} disabled={busy} onClick={async () => { if (page !== 'detail' || await discardCurrentDocument()) navigate('tasks') }}><Icon name="clock" size={18}/></Button></TooltipTrigger><TooltipContent>任务面板</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" type="button" aria-label="文档" aria-current={page === 'docs' ? 'page' : undefined} disabled={busy} onClick={async () => { if (page !== 'detail' || await discardCurrentDocument()) navigate('docs') }}><Icon name="book" size={18}/></Button></TooltipTrigger><TooltipContent>文档</TooltipContent></Tooltip><Tooltip><TooltipTrigger asChild><span className="window-toolbar-tooltip"><Button variant="ghost" size="icon-sm" type="button" aria-label="设置" aria-current={page === 'settings' ? 'page' : undefined} disabled={busy} onClick={openSettings}><Icon name="settings" size={18}/></Button></span></TooltipTrigger><TooltipContent>设置</TooltipContent></Tooltip></TooltipProvider></div></header><nav className="workspace-rail" aria-label="工作区导航"><div className="rail-brand" aria-label="灵稿 AI"><img src={logoUrl} alt=""/><span aria-hidden="true">灵稿 AI</span></div><Button variant="ghost" type="button" title="首页" aria-label="首页" aria-current={page === 'detail' && showHome ? 'page' : undefined} disabled={busy} onClick={() => { void (async () => { if (page === 'detail' && !(await discardCurrentDocument())) return; setFolderId(null); navigate('detail'); setShowHome(true) })() }}><Icon name="home" size={19}/><span>首页</span></Button><Button variant="ghost" type="button" title="内容工作区" aria-label="内容工作区" aria-current={page === 'detail' && !showHome ? 'page' : undefined} disabled={busy} onClick={() => { setFolderId(null); navigate('detail') }}><Icon name="file" size={19}/><span>文章</span></Button><Button variant="ghost" type="button" title="选题工作台" aria-label="选题工作台" aria-current={page === 'topics' ? 'page' : undefined} disabled={busy} onClick={async () => { if (page !== 'detail' || await discardCurrentDocument()) navigate('topics') }}><Icon name="bulb" size={19}/><span>选题</span></Button><Button variant="ghost" type="button" title="内容发现" aria-label="内容发现" aria-current={page === 'discover' ? 'page' : undefined} disabled={busy} onClick={async () => { if (page !== 'detail' || await discardCurrentDocument()) navigate('discover') }}><Icon name="search" size={19}/><span>发现</span></Button>{document.documentElement.dataset.windowPlatform === 'darwin' && <Button variant="ghost" type="button" title="白板视频" aria-label="白板视频" aria-current={page === 'whiteboard' ? 'page' : undefined} disabled={busy} onClick={() => { void window.whiteboardApi.videoOpen().then(result => { if (!result.ok) showMessage(result.error, true) }).catch(() => showMessage('无法打开白板视频，请重试。', true)) }}><Icon name="image" size={19}/><span>视频</span></Button>}{document.documentElement.dataset.windowPlatform === 'darwin' && <Button variant="ghost" type="button" title="白板画布" aria-label="白板画布" disabled={busy} onClick={() => { void window.whiteboardApi.canvasOpen().then(result => { if (!result.ok) showMessage(result.error, true) }).catch(() => showMessage('无法打开画布，请重试。', true)) }}><Icon name="canvas" size={19}/><span>画布</span></Button>}<Button variant="ghost" type="button" title="平台配置" aria-label="平台配置" aria-current={page === 'platforms' ? 'page' : undefined} disabled={busy} onClick={async () => { if (page !== 'detail' || await discardCurrentDocument()) navigate('platforms') }}><Icon name="grid" size={19}/><span>平台</span></Button></nav><aside className="notes-sidebar" hidden={page !== 'detail'}><div className="notes-list-header"><h2>文章</h2><div className="new-content-menu" ref={newMenuRef}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="新建" title="新建" disabled={busy}><Icon name="plus" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label="新建选项">
          <DropdownMenuItem onSelect={() => setNewFolderRequest(value => value + 1)}>新建文件夹</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openCreate(null)}>新建文章</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div></div><section className="notes-list" aria-label="内容目录"><WorkspaceTree key={workspaceVersion} selectedFolderId={page === 'detail' ? folderId : null} onIndexChange={setFolderIndex} onOpenFolder={id => { void (async () => { if (await discardCurrentDocument()) { setFolderId(id); setShowHome(false) } })() }} createRequest={newFolderRequest} drafts={visibleDrafts} articleRuns={articleRuns} selectedId={page === 'detail' && !folderId && !showHome ? selectedId : ''} selectedPlatform={selectedPlatform} platformTitles={platformTitles} enabled={!busy} refreshKey={treeVersion} onOpen={(draft, platform) => { void openDraft(draft, platform) }} onCreateArticle={openCreate} onDeleteNodes={deleteNodes} /></section></aside>
    <div className="notes-main"><main className={`notes-content ${page === 'detail' ? 'notes-content-detail' : page === 'topics' ? 'notes-content-topics' : ''}`}>
    {status && <Alert className="app-status block" role="status">{status}{page === 'detail' && (status.includes('自动保存失败') || status === '平台标题不能为空。') && <Button variant="link" size="xs" type="button" onClick={() => void (async () => { if (await discardCurrentDocument()) setStatus('') })()}>重试保存</Button>}</Alert>}
    <div hidden={page !== 'topics'}><Topics folderIndex={folderIndex} onIndexChange={index => { setFolderIndex(index); setTreeVersion(value => value + 1) }} availablePlatforms={availablePlatforms} key={workspaceVersion} active={page === 'topics'} onChoose={chooseTopic} onStatus={setTopicStatus} onBatchBusy={(value) => { setBatchBusy(value); if (!value) { setTreeVersion(current => current + 1); void refresh() } }} /></div>
    {page === 'detail' && !showHome && !folderId && selectedRun && selectedRun.status !== 'done' && <Alert className="app-status block" role="status">{selectedRun.status === 'queued' ? '文章正在排队等待生成。' : selectedRun.status === 'running' ? (selectedRun.phase === 'images' && selectedRun.imageProgress ? selectedRun.imageProgress : `文章生成中：${({ research: '检索资料', plan: '规划内容', write: '撰写文案', review: '检查内容', save: '保存文章', images: '生成配图' } as const)[selectedRun.phase ?? 'research']}…`) : (selectedRun.message || '文章生成未完成。')}{['failed', 'waiting', 'interrupted'].includes(selectedRun.status) && <Button variant="link" size="xs" type="button" className="reload-button" onClick={() => void retryArticle(selectedRun.id, false)}>重试</Button>}{selectedRun.status === 'waiting' && <Button variant="link" size="xs" type="button" className="reload-button" onClick={() => void retryArticle(selectedRun.id, true)}>跳过联网继续</Button>}</Alert>}
    {page === 'detail' && !showHome && folderId && <FolderContents folderId={folderId} index={folderIndex} drafts={visibleDrafts} onOpenFolder={setFolderId} onOpenArticle={(draft, platform) => void openDraft(draft, platform)}/>}
    {page === 'detail' && showHome && <WorkspaceHome key={workspaceVersion} workspaceVersion={workspaceVersion} articleDataReady={draftsReady} runsReady={runsLoaded} runs={articleRuns} onTasks={() => navigate('tasks')} workspace={workspaces.current ? workspaceName(workspaces.current) : ''} drafts={drafts} titles={articleTitles} loading={loading} busy={busy} onCreate={() => openCreate(null)} onTopics={() => navigate('topics')} onOpen={draft => { void openDraft(draft) }} onOpenWorkspace={() => workspaceMenuHandler.current('open')}/>}
    {page === 'detail' && !showHome && !folderId && (loading ? <div className="empty-state" role="status">正在读取文章…</div> : selectedDraft && current ? <Detail key={`${editorVersion}:${docKey}:${regenerationVersions[docKey] ?? 0}`} platformTitle={platformTitles[docKey]?.value ?? null} onPlatformTitleChange={(value) => updatePlatformTitles(all => all[docKey] ? { ...all, [docKey]: { ...all[docKey], value } } : all)} draft={displayedDraft ?? selectedDraft} selectedPlatform={selectedPlatform} document={current} editorBusy={busy || generatingArticle || regeneratingHere} onImageBusy={setOperationBusy} imageStyle={platformArticleStyles[selectedDraft.id]?.[selectedPlatform] ?? articleRuns.find(run => run.id === selectedDraft.id)?.imageStylesByPlatform?.[selectedPlatform] ?? articleStyles[selectedDraft.id] ?? defaultImageStyle} onStyleSave={(style) => saveImageStyle(selectedDraft.id, selectedPlatform, style)} onDocumentChange={(value) => updateDocuments((all) => ({ ...all, [docKey]: { ...all[docKey], content: value } }))} onRegenerate={() => void regenerateCurrent()} regenerating={regeneratingHere} /> : selectedDraft ? <div className="empty-state" role="status">正在读取文案…</div> :
      <section className="workspace-empty">
        <div className="workspace-empty-mark"><Icon name="edit" size={24}/></div>
        <h2>{visibleDrafts.length ? '打开一篇文章' : '从第一篇文章开始'}</h2>
        <p>{visibleDrafts.length ? '从左侧选择文章，继续编辑文案、配图和核查资料。' : '写一篇空白文章，或为不同平台生成文案。'}</p>
        <div><Button type="button" className="primary-button" disabled={busy} onClick={() => openCreate(null)}>新建文章</Button>
        <Button variant="outline" type="button" className="article-secondary-button" disabled={busy} onClick={() => navigate('topics')}>去选题工作台</Button></div>
      </section>)}
    {page === 'whiteboard' && <Button onClick={() => void window.whiteboardApi.videoOpen().then(result => { if (!result.ok) showMessage(result.error, true) })}>打开白板视频窗口</Button>}
    {page === 'discover' && <Discovery onBusy={setOperationBusy} onSaved={draft => { void (async () => { await refresh(draft.id); setTreeVersion(value => value + 1); await openDraft(draft, '小红书') })() }}/>}
    {page === 'tasks' && <TaskPanel workspaceVersion={workspaceVersion} runs={articleRuns} drafts={drafts} onOpenArticle={draft => { void openDraft(draft) }}/>}
    <div hidden={page !== 'platforms'}><PlatformSettings onSaved={applyPlatformLinks} /></div>
    {page === 'docs' && <Documentation />}
    {page === 'settings' && <Settings softwareUpdates={<UpdateSettings updates={updates}/>} key={workspaceVersion} onSaved={changed => { if (changed) workspaceChanged(); else { setTreeVersion(value => value + 1); void refresh() } }} />}
    </main></div>
    <Sheet open={drawerOpen} onOpenChange={open => { if (!operationBusy) setDrawerOpen(open) }}>
      <SheetContent className="create-drawer article-create-drawer max-w-none gap-0 sm:max-w-none" showCloseButton={false}
        aria-describedby={undefined}
        onEscapeKeyDown={event => { if (operationBusy) event.preventDefault() }}
        onInteractOutside={event => { if (operationBusy) event.preventDefault() }}
        onCloseAutoFocus={event => {
          event.preventDefault()
          const previous = drawerOrigin.current
          if (previous?.isConnected) previous.focus()
          else newMenuRef.current?.querySelector('button')?.focus()
        }}>
        <div className="create-drawer-header">
          <SheetTitle>新建文章</SheetTitle>
          <Button variant="ghost" size="icon-sm" aria-label="关闭新建文章" disabled={operationBusy}
            onClick={() => setDrawerOpen(false)}><Icon name="close" /></Button>
        </div>
        {status && <Alert className="app-status block" role="status">{status}</Alert>}
        <Create folderIndex={folderIndex} folderId={articleFolderId} onFolderChange={setArticleFolderId} onIndexChange={index => { setFolderIndex(index); setTreeVersion(value => value + 1) }} availablePlatforms={availablePlatforms} form={createForm} onChange={form => { setCreateForm(form); setCreateDirty(true) }}
          onBack={() => setDrawerOpen(false)} onCreate={createDraft}
          busy={operationBusy} researchFailed={researchFailed} progress={progress} imageProgress={imageProgress}/>
      </SheetContent>
    </Sheet>
    {confirmation}<WorkspaceManager action={workspaceAction} onClose={() => setWorkspaceAction(null)} onChanged={workspaceChanged} beforeSwitch={beforeWorkspaceSwitch}/>
    <UpdateDialog updates={updates}/>
  </div>
}
