import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Icon } from '../components/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useMessage } from '../components/MessageProvider'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { platforms, type Platform } from '../../../shared/drafts'
import { defaultImageStyle, type ImageStyle } from '../../../shared/image-styles'
import { defaultTopicCount, minTopicCount, maxTopicCount } from '../../../shared/topics'
import type { TopicBatch, TopicCandidate, TopicEvent, TopicWorkspace } from '../../../shared/topics'
import type { WorkspaceIndex } from '../../../shared/workspace'
import { FolderPicker } from './FolderPicker'
import { PublishSettings } from './Create'

const empty = (): TopicWorkspace => ({ version: 1, batches: [], tasks: [] })
const phaseLabels: Record<TopicEvent['phase'], string> = { search: '搜索公开资料', read: '读取来源', generate: '生成候选选题', organize: '整理返回结果' }
export function Topics({ onChoose, onStatus, onBatchBusy, active, availablePlatforms, folderIndex, onIndexChange }: { folderIndex: WorkspaceIndex; onIndexChange: (index: WorkspaceIndex) => void; availablePlatforms: Platform[]; onChoose: (candidate: TopicCandidate, batch: TopicBatch) => void; onStatus: (status: string) => void; onBatchBusy: (busy: boolean) => void; active: boolean }) {
  const showMessage = useMessage()
  const [data, setData] = useState<TopicWorkspace>(empty)
  const dataRef = useRef<TopicWorkspace>(empty())
  const [loaded, setLoaded] = useState(false), [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState(false)
  const directionRef = useRef<HTMLInputElement>(null)
  const generateButtonRef = useRef<HTMLButtonElement>(null)
  const drawerOrigin = useRef<'topics' | 'batch'>('topics')
  const [selectedKey, setSelectedKey] = useState('')
  const [drawer, setDrawer] = useState<'topics' | 'batch' | null>(null)
  const [direction, setDirection] = useState(''), [audience, setAudience] = useState('')
  const [count, setCount] = useState(defaultTopicCount)
  const [selected, setSelected] = useState<number[]>([]), [chosen, setChosen] = useState<Platform[]>([...platforms])
  const [batchFolderId, setBatchFolderId] = useState<string | null>(null)
  const [batchError, setBatchError] = useState('')
  const [images, setImages] = useState(false), [style, setStyle] = useState<ImageStyle>(defaultImageStyle)
  const [batchBusy, setBatchBusy] = useState(false), [submitting, setSubmitting] = useState(false), [retrying, setRetrying] = useState('')
  const submitRef = useRef(false), batchButtonRef = useRef<HTMLButtonElement>(null), refreshId = useRef(0)
  const topicRuns = data.topicRuns ?? []
  const linkedRecords = new Set(topicRuns.map(task => task.recordId).filter((id): id is string => Boolean(id)))
  const legacyRecords = data.batches.filter(item => !linkedRecords.has(item.id))
  const effectiveKey = selectedKey || (topicRuns[0] ? `run:${topicRuns[0].id}` : legacyRecords[0] ? `record:${legacyRecords[0].id}` : '')
  const currentRun = topicRuns.find(task => `run:${task.id}` === effectiveKey)
  const record = data.batches.find(item => item.id === (currentRun?.recordId ?? (effectiveKey.startsWith('record:') ? effectiveKey.slice(7) : '')))
  async function refreshRecords(): Promise<void> {
    const id = ++refreshId.current
    try {
      const result = await window.topicsApi.readRecords()
      if (id !== refreshId.current) return
      if (!result.ok) { setMessage(result.error); return }
      dataRef.current = result.value; setData(result.value); setLoaded(true)
      const active = (result.value.topicRuns ?? []).some(task => task.status === 'queued' || task.status === 'running' || task.status === 'waiting')
      onStatus(active ? '选题生成中' : '')
    } catch { if (id === refreshId.current) setMessage('无法读取选题记录，请检查工作空间。') }
  }
  useEffect(() => {
    let active = true
    const unsubscribe = window.topicsApi.onChanged(() => { if (active) void refreshRecords() })
    void refreshRecords()
    return () => { active = false; refreshId.current++; unsubscribe() }
  }, [])
  useEffect(() => { if (active) void refreshRecords() }, [active])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(false), 2800)
    return () => window.clearTimeout(timer)
  }, [notice])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitRef.current) return
    if (!availablePlatforms.length) { setFormError('请先在平台配置中启用支持文章生成的平台。'); return }
    if (!direction.trim()) {
      setFormError('请输入内容方向。')
      directionRef.current?.focus()
      return
    }
    submitRef.current = true; setSubmitting(true); setFormError(''); onStatus('选题生成中')
    try {
      const result = await window.topicsApi.start({ direction: direction.trim(), audience: audience.trim(), platforms: [...availablePlatforms], count })
      if (!result.ok) { setFormError(result.error); await refreshRecords(); return }
      setDrawer(null); setSelectedKey(''); setSelected([]); setNotice(true)
      await refreshRecords()
    } catch { setFormError('无法创建选题任务，请检查工作空间后重试。'); await refreshRecords() }
    finally { submitRef.current = false; setSubmitting(false) }
  }
  async function retry(id: string, mode: 'retry' | 'skip') {
    if (retrying) return
    setRetrying(id); setMessage('')
    try { const result = await window.topicsApi.retry(id, mode); if (!result.ok) setMessage(result.error); else await refreshRecords() }
    catch { setMessage('无法重试，请检查工作空间后重试。') }
    finally { setRetrying('') }
  }
  async function openSource(url: string) { try { const result = await window.topicsApi.openSource(url); if (!result.ok) setMessage('无法打开来源链接。') } catch { setMessage('无法打开来源链接。') } }
  async function createBatch() {
    if (!record || !selected.length || !chosen.length || batchBusy) return
    if (!batchFolderId) { setBatchError('请选择保存文件夹。'); return }
    setBatchBusy(true); onBatchBusy(true); setBatchError('')
    try {
      const result = await window.topicsApi.startBatch({ batchId: record.id, indexes: selected, platforms: chosen, imageStyle: style, generateImages: images, folderId: batchFolderId })
      if (!result.ok) { setBatchError(result.error); return }
      const { started, skipped, failed } = result.value
      setDrawer(null); setSelected([])
      showMessage([started ? `${started} 个文章任务已加入队列` : '', skipped ? `跳过 ${skipped} 个已完成或已有进行中任务的选题` : '', failed ? `${failed} 个创建失败，请查看任务状态` : ''].filter(Boolean).join('；') + '。')
      await refreshRecords()
    } catch { setBatchError('无法创建文章任务，请检查工作空间。') }
    finally { setBatchBusy(false); onBatchBusy(false) }
  }
  const recordCount = topicRuns.length + legacyRecords.length
  const statusLabels = {
    queued: '排队中', running: '生成中…', waiting: '等待处理',
    done: '已完成', failed: '失败', interrupted: '已中断'
  }
  function chooseRecord(key: string) { setSelectedKey(key); setSelected([]) }
  const canRetry = currentRun && ['failed', 'interrupted', 'waiting'].includes(currentRun.status)

  return <div className="topics-workbench">
    <div>
      <div className="topic-view-toolbar">
        <div className="topic-list-heading"><h1>选题记录</h1><span>{recordCount}</span></div>
        <Button type="button" className="primary-button topic-create-button" ref={generateButtonRef} disabled={!loaded || batchBusy}
          onClick={() => { setMessage(''); setFormError(''); setNotice(false); drawerOrigin.current = 'topics'; setDrawer('topics') }}><Icon name="plus" size={16}/>生成选题</Button>
      </div>
      {message && <p role="status" className="topic-message block">{message}</p>}
      <div className="topic-split">
        <aside className="topic-record-list" aria-label="选题记录">
          {!loaded && <p className="topic-list-empty" role="status">正在读取选题记录…</p>}
          {loaded && !recordCount && <p className="topic-list-empty">暂无选题记录</p>}
          {topicRuns.map(task => {
            const batch = data.batches.find(item => item.id === task.recordId)
            return <Button variant="ghost" key={task.id} type="button" className="topic-record-item" aria-pressed={effectiveKey === `run:${task.id}`} onClick={() => chooseRecord(`run:${task.id}`)}>
              <strong>{task.request.direction}</strong><span className="topic-record-meta"><span>{new Date(task.createdAt).toLocaleDateString('zh-CN')}</span><span>{batch?.batch.candidates.length ?? task.request.count ?? defaultTopicCount} 个选题</span></span>
              <span className="topic-record-status topic-status-pill" data-status={task.status}>{statusLabels[task.status]}</span>
            </Button>
          })}
          {legacyRecords.map(item => <Button variant="ghost" key={item.id} type="button" className="topic-record-item" aria-pressed={effectiveKey === `record:${item.id}`} onClick={() => chooseRecord(`record:${item.id}`)}>
            <strong>{item.batch.request.direction}</strong><span className="topic-record-meta"><span>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</span><span>{item.batch.candidates.length} 个选题</span></span><span className="topic-record-status topic-status-pill" data-status="done">已完成</span>
          </Button>)}
        </aside>
        <section className="topic-record-content" aria-label="选题详情">
          {record ? <>
            <Card className="topic-card topic-candidates-card">
              <div className="topic-batch-heading"><div><Checkbox aria-label="全选本组选题" checked={selected.length === record.batch.candidates.length && selected.length > 0} onCheckedChange={checked => setSelected(checked === true ? record.batch.candidates.map((_, index) => index) : [])}/><strong>选题明细</strong><span>已选 {selected.length} 项</span></div>
                <Button type="button" ref={batchButtonRef} className="primary-button" disabled={!selected.length || batchBusy} onClick={() => { setChosen([...availablePlatforms]); setImages(false); setStyle(defaultImageStyle); setBatchError(''); setBatchFolderId(folderIndex.generationFolderId ?? folderIndex.defaultFolderId ?? null); drawerOrigin.current = 'batch'; setDrawer('batch') }}>批量创建文章</Button>
              </div>
              <table className="topic-candidate-table-view" aria-label="选题明细"><colgroup><col className="topic-select-column"/><col/><col className="topic-status-column"/><col className="topic-action-column"/></colgroup><thead><tr><th scope="col"><span className="sr-only">选择</span></th><th scope="col">选题</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>{record.batch.candidates.map((candidate, index) => {
                const task = data.tasks.find(item => item.batchId === record.id && item.index === index)
                return <tr key={index}>
                  <td><Checkbox aria-label={`选择 ${candidate.title}`} checked={selected.includes(index)} onCheckedChange={checked => setSelected(items => checked === true ? [...items, index] : items.filter(item => item !== index))}/></td>
                  <td><div className="topic-candidate-body"><div className="topic-candidate-title"><strong>{candidate.title}</strong></div>
                    <p className="topic-candidate-angle">{candidate.angle}</p><details className="topic-candidate-detail"><summary>查看详情</summary><p>{candidate.reason}</p><p>推荐平台：{candidate.platforms.join('、') || '未指定'}（仅供参考）</p><p>待核事项：{candidate.pending.join('；') || '请核查事实与来源。'}</p>
                      {candidate.sourceIndexes.length > 0 && <div>参考来源：{candidate.sourceIndexes.map(n => { const source = record.batch.sources[n - 1]; return source && <Button variant="link" size="xs" key={n} className="topic-source-link" type="button" onClick={() => void openSource(source.url)}>{source.title}</Button> })}</div>}
                    </details>
                  </div></td>
                  <td><Badge variant="secondary" className="topic-status-tag" data-status={task?.waiting ? 'waiting' : task?.status ?? 'idle'}>{task ? (task.waiting ? '等待处理' : { running: '创作中', done: '已完成', failed: '失败', interrupted: '已中断' }[task.status]) : '未加入'}</Badge></td>
                  <td><Button type="button" size="sm" className="topic-generate-candidate" disabled={batchBusy} aria-label={`生成文章：${candidate.title}`} onClick={() => onChoose(candidate, record.batch)}>生成</Button></td>
                </tr>
              })}</tbody></table>
              <div className="topic-detail-footer"><span>待核事项：适用范围、最新信息和来源。</span><details><summary>查看来源（{record.batch.sources.length}）</summary>
                {record.batch.skipped && <p>本批未使用联网资料，请自行核查。</p>}
                {record.batch.sources.length > 0 && <ul>{record.batch.sources.map(source => <li key={source.url}><Button variant="link" size="xs" type="button" className="topic-source-link" onClick={() => void openSource(source.url)}>{source.title}</Button>{source.origin === 'model_search_unlinked' ? '模型联网来源，未逐条关联摘要' : source.origin === 'model_search' ? '模型联网整理，请核查原文' : source.fetched ? '已读取网页' : '仅搜索摘要'}</li>)}</ul>}
              </details></div>
            </Card>
          </> : currentRun ? <div className="topic-record-placeholder" role="status"><strong>{currentRun.request.direction}</strong><p>{currentRun.message || (currentRun.status === 'running' ? phaseLabels[currentRun.phase] : statusLabels[currentRun.status])}</p>{canRetry && <div className="topic-retry-actions"><Button variant="outline" size="sm" disabled={Boolean(retrying)} onClick={() => void retry(currentRun.id, 'retry')}>重试</Button>{currentRun.status === 'waiting' && <Button variant="ghost" size="sm" disabled={Boolean(retrying)} onClick={() => void retry(currentRun.id, 'skip')}>跳过联网继续</Button>}</div>}</div> : <div className="topic-record-placeholder"><p>{loaded ? '选择一条选题记录查看详情。' : '正在读取选题记录…'}</p></div>}
        </section>
      </div>
    </div>

    {notice && <div className="topic-toast" role="status">选题已加入队列。</div>}
    <Sheet open={drawer !== null} onOpenChange={open => {
      if (!open && !submitRef.current && !batchBusy) setDrawer(null)
    }}>
      <SheetContent className={`create-drawer topic-sheet max-w-none gap-0 sm:max-w-none ${drawer === 'topics' ? 'topic-generation-drawer' : 'article-create-drawer'}`}
        aria-describedby={undefined} showCloseButton={false}
        onOpenAutoFocus={event => {
          if (drawer === 'topics') { event.preventDefault(); directionRef.current?.focus() }
        }}
        onCloseAutoFocus={event => {
          event.preventDefault()
          if (drawerOrigin.current === 'batch' && batchButtonRef.current) batchButtonRef.current.focus()
          else generateButtonRef.current?.focus()
        }}
        onEscapeKeyDown={event => { if (submitRef.current || batchBusy) event.preventDefault() }}
        onInteractOutside={event => { if (submitRef.current || batchBusy) event.preventDefault() }}>
        <div className="create-drawer-header">
          <SheetTitle>{drawer === 'topics' ? '生成选题' : '批量创建文章'}</SheetTitle>
          <Button variant="ghost" size="icon-sm" aria-label={drawer === 'topics' ? '关闭生成选题' : '关闭批量创建文章'}
            disabled={submitting || batchBusy} onClick={() => setDrawer(null)}><Icon name="close" /></Button>
        </div>
        {drawer === 'topics' ? <form className="topic-generation-form" onSubmit={submit}>
          <div className="topic-generation-fields">
            <p>填写内容方向，生成一组选题供挑选。</p>
            <Label className="field">
              <span>内容方向 <b aria-hidden="true">*</b></span>
              <Input name="direction" ref={directionRef} placeholder="例如：北京社保" required maxLength={100}
                value={direction} onChange={event => { setDirection(event.target.value); setFormError('') }} disabled={submitting}/>
            </Label>
            <Label className="field">
              <span>目标受众 <em>选填</em></span>
              <Input name="audience" placeholder="例如：刚参加工作的年轻人" maxLength={500}
                value={audience} onChange={event => setAudience(event.target.value)} disabled={submitting}/>
            </Label>
            <div className="topic-count-field">
              <div className="topic-count-heading"><span>生成数量</span><output>{count} 个</output></div>
              <Slider className="topic-count-slider" thumbLabel="生成数量" min={minTopicCount} max={maxTopicCount} step={1}
                value={[count]} disabled={submitting} onValueChange={values => { if (values[0] !== undefined) setCount(values[0]) }}/>
              <div className="topic-count-limits"><span>{minTopicCount} 个</span><span>{maxTopicCount} 个</span></div>
            </div>
            {formError && <p role="alert" className="topic-form-error">{formError}</p>}
          </div>
          <div className="topic-generation-actions">
            <Button variant="outline" type="button" className="topic-secondary-button" disabled={submitting} onClick={() => setDrawer(null)}>取消</Button>
            <Button type="submit" className="primary-button" disabled={submitting}>{submitting ? '提交中…' : '生成选题'}</Button>
          </div>
        </form> : <div className="page-wrap narrow"><Button variant="link" size="xs" className="back-button" onClick={() => setDrawer(null)}><Icon name="back" size={17}/> 返回选题</Button>
          <Card asChild><form className="form-card" onSubmit={event => { event.preventDefault(); void createBatch() }}><fieldset className="settings-fields" disabled={batchBusy}>
            <FolderPicker index={folderIndex} value={batchFolderId} onChange={setBatchFolderId} onIndexChange={onIndexChange} disabled={batchBusy}/><p className="muted">选题文件夹：{record?.batch.request.direction}</p><PublishSettings availablePlatforms={availablePlatforms} selected={chosen} onPlatformsChange={setChosen} generateImages={images} onImagesChange={setImages} imageStyle={style} onImageStyleChange={setStyle} disabled={batchBusy}/>
            {batchError && <p role="alert" className="error">{batchError}</p>}
            <div className="form-actions"><div className="creation-actions"><Button type="submit" className="primary-button" disabled={!chosen.length || batchBusy}>批量生成并保存文案</Button></div></div>
          </fieldset></form></Card></div>}
      </SheetContent>
    </Sheet>
  </div>
}
