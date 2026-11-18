import { useEffect, useState } from 'react'
import type { Draft, Platform, CreateRequest, CreateResult } from '../../shared/drafts'
import type { GenerationProgress } from '../../shared/research'
import { Icon } from './components/Icon'
import { Create } from './features/Create'
import { Detail } from './features/Detail'
import { Settings } from './features/Settings'
import type { OpenDocument } from './features/types'

type Page = 'create' | 'detail' | 'settings'
function BrandMark() { return <div className="brand-mark"><span /><span /><span /><span /></div> }

export default function App() {
  const [page, setPage] = useState<Page>('detail')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('小红书')
  const [documents, setDocuments] = useState<Record<string, OpenDocument>>({})
  const [editorBusy, setEditorBusy] = useState(false)
  const [editorVersion, setEditorVersion] = useState(0)
  const [operationBusy, setOperationBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [researchFailed, setResearchFailed] = useState(false)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const selectedDraft = drafts.find((draft) => draft.id === selectedId)
  const dirty = Object.values(documents).some((doc) => doc.content !== doc.savedContent)
  const docKey = `${selectedId}:${selectedPlatform}`
  const current = documents[docKey]
  async function refresh(preferredId?: string) {
    if (!window.draftsApi) { setStatus('请在桌面应用中使用本地草稿。'); setLoading(false); return }
    try {
      const result = await window.draftsApi.list()
      if (!result.ok) { setStatus(result.error); setDrafts([]); return }
      setStatus(''); setDrafts(result.value)
      const draft = result.value.find((item) => item.id === preferredId) ?? result.value.find((item) => item.id === selectedId) ?? result.value[0]
      if (draft) { setSelectedId(draft.id); setSelectedPlatform((p) => draft.id === selectedId && draft.platforms.includes(p) ? p : draft.platforms[0]) }
      else setSelectedId('')
    } catch { setStatus('无法读取草稿目录，请检查设置和目录权限。') } finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])
  useEffect(() => { if (!window.draftsApi) return; return window.draftsApi.onProgress(setProgress) }, [])
  useEffect(() => {
    if (!selectedDraft || current || !window.draftsApi) return
    let active = true
    void window.draftsApi.read(selectedId, selectedPlatform).then((result) => {
      if (!active) return
      if (!result.ok) { setStatus(result.error); return }
      setDocuments((all) => ({ ...all, [docKey]: { ...result.value, savedContent: result.value.content } }))
    }).catch(() => { if (active) setStatus('无法读取草稿。') })
    return () => { active = false }
  }, [selectedId, selectedPlatform, current, selectedDraft, docKey])
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
  function openDraft(draft: Draft) { setStatus(''); setSelectedId(draft.id); setSelectedPlatform(draft.platforms[0]); setPage('detail') }
  async function createDraft(request: CreateRequest): Promise<CreateResult | null> {
    setOperationBusy(true); setStatus(''); setResearchFailed(false); setProgress(null)
    try {
      const result = await window.draftsApi.generate(request)
      if (!result.ok) { setStatus(result.error); setResearchFailed(result.code === 'RESEARCH_UNAVAILABLE'); return null }
      await refresh(result.value.draft?.id)
      if (result.value.draft) { setSelectedId(result.value.draft.id); setSelectedPlatform(result.value.draft.platforms[0]); setPage('detail') }
      const notes = [...(result.value.failures.length ? [`以下平台生成或保存失败：${result.value.failures.map((item) => item.platform).join('、')}。`] : ['文案已生成并保存，请人工核查事实后使用。']), ...(result.value.warnings ?? [])]
      setStatus(notes.join(' '))
      return result.value
    } catch { setStatus('生成失败，请检查模型服务和目录。'); return null } finally { setOperationBusy(false); setProgress(null) }
  }
  async function saveCurrent() {
    if (!current) return
    const snapshot = current.content
    setOperationBusy(true); setStatus('')
    try {
      const result = await window.draftsApi.save(selectedId, selectedPlatform, snapshot, current.version)
      if (!result.ok) { setStatus(result.error); return }
      setDocuments((all) => ({ ...all, [docKey]: { content: all[docKey]?.content ?? snapshot, savedContent: snapshot, version: result.value.version } }))
      setStatus('文案已保存。')
    } catch { setStatus('保存失败，请检查目录权限。') } finally { setOperationBusy(false) }
  }
  async function reloadCurrent() {
    if (!current || !window.confirm('重新读取将丢弃当前平台未保存的修改，是否继续？')) return
    setOperationBusy(true)
    try {
      const result = await window.draftsApi.read(selectedId, selectedPlatform)
      if (!result.ok) { setStatus(result.error); return }
      setDocuments((all) => ({ ...all, [docKey]: { ...result.value, savedContent: result.value.content } }))
      setEditorVersion((value) => value + 1); setStatus('已重新读取文件。')
    } catch { setStatus('无法读取草稿。') } finally { setOperationBusy(false) }
  }
  function openSettings() {
    if (dirty && !window.confirm('还有未保存的修改。更换草稿目录时这些修改会丢失，是否继续打开设置？')) return
    setStatus(''); setPage('settings')
  }
  const busy = editorBusy || operationBusy
  return <div className="app-shell notes-shell"><aside className="notes-sidebar"><div className="notes-brand"><BrandMark /><div><strong>Post Agents</strong><span>内容创作工作台</span></div></div><div className="notes-list-header"><span>内容</span><button type="button" aria-label="新建内容" title="新建内容" disabled={busy} onClick={() => { setStatus(''); setPage('create') }}><Icon name="plus" size={18}/></button></div><nav className="notes-list" aria-label="内容主题">{drafts.map((draft) => <button type="button" key={draft.id} disabled={busy} className={`note-item ${page === 'detail' && selectedId === draft.id ? 'active' : ''}`} onClick={() => openDraft(draft)} aria-current={page === 'detail' && selectedId === draft.id ? 'page' : undefined}><Icon name="file" size={16}/><span title={draft.title}>{draft.title}</span></button>)}</nav><div className="notes-sidebar-bottom"><button type="button" disabled={busy} className={`notes-settings ${page === 'settings' ? 'active' : ''}`} onClick={openSettings}><Icon name="settings" size={18}/> 设置</button><div className="notes-demo"><span className="status-dot"/> 本地工作区</div></div></aside>
    <div className="notes-main"><header className="notes-topbar"><span>{page === 'detail' ? selectedDraft?.title ?? '内容工作区' : page === 'create' ? '新建内容' : '设置'}</span><span className="demo-pill"><span/>本地草稿</span></header><main className={`notes-content ${page === 'detail' ? 'notes-content-detail' : ''}`}>
    {status && <div className="app-status" role="status">{status}</div>}
    {page === 'create' && <Create onBack={() => setPage('detail')} onCreate={createDraft} busy={operationBusy} researchFailed={researchFailed} progress={progress} />}
    {page === 'detail' && (loading ? <div className="empty-state">正在读取草稿…</div> : selectedDraft && current ? <Detail key={editorVersion} draft={selectedDraft} selectedPlatform={selectedPlatform} onPlatform={setSelectedPlatform} document={current} editorBusy={busy} onBusyChange={setEditorBusy} onSave={saveCurrent} onReload={reloadCurrent} onImageBusy={setOperationBusy} onDocumentChange={(value) => setDocuments((all) => ({ ...all, [docKey]: { ...all[docKey], content: value } }))} /> : <div className="empty-state">{selectedDraft ? '正在读取文案…' : '还没有草稿。请在设置中选择草稿目录，或新建内容。'}</div>)}
    {page === 'settings' && <Settings onSaved={(directoryChanged) => { if (directoryChanged) setDocuments({}); void refresh() }} />}
    </main></div></div>
}
