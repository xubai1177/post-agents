import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Icon } from '../components/Icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { platforms, type Draft, type Platform } from '../../../shared/drafts'
import { defaultImageStyle, type ImageStyle } from '../../../shared/image-styles'
import { defaultTopicCount, minTopicCount, maxTopicCount } from '../../../shared/topics'
import type { TopicBatch, TopicCandidate, TopicEvent, TopicWorkspace } from '../../../shared/topics'
import { PublishSettings } from './Create'

const empty = (): TopicWorkspace => ({ version: 1, batches: [], tasks: [] })
const phaseLabels: Record<TopicEvent['phase'], string> = { search: '搜索公开资料', read: '读取来源', generate: '生成候选选题', organize: '整理返回结果' }
export function Topics({ onChoose, onStatus, onOpen, onBatchBusy, drafts, active, availablePlatforms }: { availablePlatforms: Platform[]; onChoose: (candidate: TopicCandidate, batch: TopicBatch) => void; onStatus: (status: string) => void; onOpen: (draft: Draft) => void; onBatchBusy: (busy: boolean) => void; drafts: Draft[]; active: boolean }) {
  const [data, setData] = useState<TopicWorkspace>(empty)
  const dataRef = useRef<TopicWorkspace>(empty())
  const [loaded, setLoaded] = useState(false), [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState(false)
  const directionRef = useRef<HTMLInputElement>(null)
  const generateButtonRef = useRef<HTMLButtonElement>(null)
  const detailsBackRef = useRef<HTMLButtonElement>(null)
  const recordButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const returningFromRecord = useRef('')
  const [view, setView] = useState<'records' | 'tasks'>('records'), [recordId, setRecordId] = useState('')
  const [taskView, setTaskView] = useState<'active' | 'done'>('active')
  const [drawer, setDrawer] = useState<'topics' | 'batch' | null>(null)
  const [direction, setDirection] = useState(''), [audience, setAudience] = useState('')
  const [count, setCount] = useState(defaultTopicCount)
  const [selected, setSelected] = useState<number[]>([]), [chosen, setChosen] = useState<Platform[]>([...platforms])
  const [batchError, setBatchError] = useState('')
  const [images, setImages] = useState(false), [style, setStyle] = useState<ImageStyle>(defaultImageStyle)
  const [batchBusy, setBatchBusy] = useState(false), [submitting, setSubmitting] = useState(false), [retrying, setRetrying] = useState('')
  const submitRef = useRef(false), batchButtonRef = useRef<HTMLButtonElement>(null), refreshId = useRef(0)
  const record = data.batches.find(item => item.id === recordId)
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
  useEffect(() => {
    if (view !== 'records') return
    if (recordId) detailsBackRef.current?.focus()
    else if (returningFromRecord.current) {
      recordButtonRefs.current.get(returningFromRecord.current)?.focus()
      returningFromRecord.current = ''
    }
  }, [view, recordId])
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
      setDrawer(null); setView('records'); setRecordId(''); setNotice(true)
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
    setBatchBusy(true); onBatchBusy(true); setBatchError('')
    try {
      const result = await window.topicsApi.startBatch({ batchId: record.id, indexes: selected, platforms: chosen, imageStyle: style, generateImages: images })
      if (!result.ok) { setBatchError(result.error); return }
      setDrawer(null); setView('tasks'); setTaskView('active'); setSelected([])
      await refreshRecords()
    } catch { setBatchError('无法创建文章任务，请检查工作空间。') }
    finally { setBatchBusy(false); onBatchBusy(false) }
  }
  async function retryArticleTask(id: string, skip: boolean) {
    if (retrying) return
    setRetrying(id)
    try {
      const result = await window.draftsApi.retryArticle(id, skip)
      if (!result.ok) setMessage(result.error)
      await refreshRecords()
    } catch { setMessage('无法重试，请检查工作空间。') }
    finally { setRetrying('') }
  }

  const topicRuns = data.topicRuns ?? []
  const linkedRecords = new Set(topicRuns.map(task => task.recordId).filter((id): id is string => Boolean(id)))
  const legacyRecords = data.batches.filter(item => !linkedRecords.has(item.id))
  const recordCount = topicRuns.length + legacyRecords.length
  const statusLabels = {
    queued: '排队中', running: '生成中…', waiting: '等待处理',
    done: '已完成', failed: '失败', interrupted: '已中断'
  }
  const activeTasks = data.tasks.filter(task => task.status !== 'done')
  const completedTasks = data.tasks.filter(task => task.status === 'done')
  const shownTasks = taskView === 'done' ? completedTasks : activeTasks

  function viewRecordButton(id: string) {
    return <Button variant="link" size="xs" type="button" className="topic-text-button" ref={button => {
      if (button) recordButtonRefs.current.set(id, button)
      else recordButtonRefs.current.delete(id)
    }} onClick={() => { setRecordId(id); setSelected([]) }}>查看选题</Button>
  }

  return <div className="topics-workbench">
    <div>
      <header className="studio-hero topic-hero">
        <h1>选题工作台</h1>
        <Button type="button" className="primary-button topic-create-button" ref={generateButtonRef} disabled={!loaded || batchBusy}
          onClick={() => { setMessage(''); setFormError(''); setNotice(false); setDrawer('topics') }}>
          <span aria-hidden="true">＋</span>生成选题
        </Button>
      </header>
      <div className="topic-view-toolbar">
        <div className="topic-view-switch" role="group" aria-label="选题工作台视图">
          <Button variant="ghost" type="button" aria-pressed={view === 'records'} onClick={() => { setView('records'); setRecordId('') }}>
            选题记录 <span>{recordCount}</span>
          </Button>
          <Button variant="ghost" type="button" aria-pressed={view === 'tasks'} onClick={() => { setView('tasks'); void refreshRecords() }}>
            创作任务 <span>{data.tasks.length}</span>
          </Button>
        </div>
      </div>

      {message && <p role="status" className="topic-message block">{message}</p>}
      {view === 'records' && !record && <section aria-label="选题记录">
        <Card className="topic-card">
          {recordCount ? <Table containerClassName="topic-table-wrap" className="topic-table topic-records-table" aria-label="选题记录">
              <TableHeader><TableRow>
                <TableHead scope="col">选题方向</TableHead><TableHead scope="col">目标受众</TableHead><TableHead scope="col">选题数</TableHead>
                <TableHead scope="col">创建时间</TableHead><TableHead scope="col">状态</TableHead><TableHead scope="col">操作</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {topicRuns.map(task => {
                  const batch = data.batches.find(item => item.id === task.recordId)
                  const canRetry = task.status === 'failed' || task.status === 'interrupted' || task.status === 'waiting'
                  return <TableRow key={task.id}>
                    <TableCell><strong>{task.request.direction}</strong></TableCell>
                    <TableCell>{task.request.audience || '—'}</TableCell>
                    <TableCell>{batch?.batch.candidates.length ?? task.request.count ?? defaultTopicCount}</TableCell>
                    <TableCell>{new Date(task.createdAt).toLocaleString('zh-CN')}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" role="status" className="topic-status-pill" data-status={task.status}>{statusLabels[task.status]}</Badge>
                      {task.status === 'running' && <p className="topic-cell-note">{phaseLabels[task.phase]}</p>}
                      {task.message && <p className="topic-cell-note">{task.message}</p>}
                    </TableCell>
                    <TableCell><div className="topic-task-actions">
                      {task.status === 'done' && batch && viewRecordButton(batch.id)}
                      {canRetry && <Button variant="link" size="xs" type="button" className="topic-text-button" disabled={Boolean(retrying)} onClick={() => void retry(task.id, 'retry')}>重试</Button>}
                      {task.status === 'waiting' && <Button variant="link" size="xs" type="button" className="topic-text-button" disabled={Boolean(retrying)} onClick={() => void retry(task.id, 'skip')}>跳过联网继续</Button>}
                      {!canRetry && !(task.status === 'done' && batch) && '—'}
                    </div></TableCell>
                  </TableRow>
                })}
                {legacyRecords.map(item => <TableRow key={item.id}>
                  <TableCell><strong>{item.batch.request.direction}</strong></TableCell>
                  <TableCell>{item.batch.request.audience || '—'}</TableCell>
                  <TableCell>{item.batch.candidates.length}</TableCell>
                  <TableCell>{new Date(item.createdAt).toLocaleString('zh-CN')}</TableCell>
                  <TableCell><Badge variant="secondary" className="topic-status-pill" data-status="done">已完成</Badge></TableCell>
                  <TableCell>{viewRecordButton(item.id)}</TableCell>
                </TableRow>)}
              </TableBody>
            </Table> : <div className="topic-empty">{loaded ? '还没有选题记录。生成选题后，可以在这里比较和挑选创作方向。' : '正在读取选题记录…'}</div>}
        </Card>
      </section>}

      {view === 'records' && record && <section className="topic-detail-page">
        <div className="topic-detail-nav">
          <Button variant="link" size="xs" type="button" className="topic-text-button" ref={detailsBackRef} onClick={() => {
            returningFromRecord.current = record.id
            setRecordId('')
          }}>← 返回选题记录</Button>
        </div>
        <div className="topic-detail-heading">
          <h2>{record.batch.request.direction}</h2>
          <p>{record.batch.request.audience || '未指定受众'} · {record.batch.candidates.length} 个选题 · {new Date(record.createdAt).toLocaleString('zh-CN')}</p>
        </div>
        <Card className="topic-card">
          <div className="topic-batch-heading">
            <div><strong>选题明细</strong><span>已选 {selected.length} 项</span></div>
            <Button type="button" ref={batchButtonRef} className="primary-button" disabled={!selected.length || batchBusy}
              onClick={() => { setChosen([...availablePlatforms]); setImages(false); setStyle(defaultImageStyle); setBatchError(''); setDrawer('batch') }}>批量创建文章</Button>
          </div>
          <Table containerClassName="topic-table-wrap" className="topic-table topic-candidate-table" aria-label="选题明细">
              <TableHeader><TableRow>
                <TableHead scope="col"><Checkbox aria-label="全选本组选题"
                  checked={selected.length === record.batch.candidates.length && selected.length > 0}
                  onCheckedChange={checked => setSelected(checked === true ? record.batch.candidates.map((_, index) => index) : [])}/></TableHead>
                <TableHead scope="col">选题</TableHead><TableHead scope="col">创作角度</TableHead><TableHead scope="col">状态</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {record.batch.candidates.map((candidate, index) => {
                  const task = data.tasks.find(item => item.batchId === record.id && item.index === index)
                  return <TableRow key={index}>
                    <TableCell><Checkbox aria-label={`选择 ${candidate.title}`} checked={selected.includes(index)}
                      onCheckedChange={checked => setSelected(items => checked === true ? [...items, index] : items.filter(item => item !== index))}/></TableCell>
                    <TableCell>
                      <strong>{candidate.title}</strong>
                      <details className="topic-candidate-detail">
                        <summary>查看详情</summary>
                        <p>{candidate.reason}</p>
                        <p>推荐平台：{candidate.platforms.join('、') || '未指定'}（仅供参考）</p>
                        <p>待核事项：{candidate.pending.join('；') || '请核查事实与来源。'}</p>
                        {candidate.sourceIndexes.length > 0 && <div>参考来源：
                          {candidate.sourceIndexes.map(n => {
                            const source = record.batch.sources[n - 1]
                            return source && <Button variant="link" size="xs" key={n} className="topic-source-link" type="button" onClick={() => void openSource(source.url)}>{source.title}</Button>
                          })}
                        </div>}
                        <Button variant="link" size="xs" type="button" className="topic-text-button" onClick={() => onChoose(candidate, record.batch)}>单篇创作</Button>
                      </details>
                    </TableCell>
                    <TableCell>{candidate.angle}</TableCell>
                    <TableCell>{task ? <Badge variant="secondary" className="topic-status-tag">{{ running: '创作中', done: '已完成', failed: '失败', interrupted: '已中断' }[task.status]}</Badge> : <span className="topic-cell-note">未加入</span>}</TableCell>
                  </TableRow>
                })}
              </TableBody>
            </Table>
          <div className="topic-detail-footer">
            <span>待核事项：适用范围、最新信息和来源。</span>
            <details>
              <summary>查看来源（{record.batch.sources.length}）</summary>
              {record.batch.skipped && <p>本批未使用联网资料，请自行核查。</p>}
              {record.batch.sources.length > 0 && <ul>{record.batch.sources.map(source => <li key={source.url}>
                <Button variant="link" size="xs" type="button" className="topic-source-link" onClick={() => void openSource(source.url)}>{source.title}</Button>
                {source.origin === 'model_search_unlinked' ? '模型联网来源，未逐条关联摘要' : source.origin === 'model_search' ? '模型联网整理，请核查原文' : source.fetched ? '已读取网页' : '仅搜索摘要'}
              </li>)}</ul>}
            </details>
          </div>
        </Card>
      </section>}

      {view === 'tasks' && <section aria-label="创作任务">
        <Card className="topic-card topic-task-card">
          <div className="topic-task-filter" role="group" aria-label="任务状态">
            <Button variant="ghost" type="button" aria-pressed={taskView === 'active'} onClick={() => setTaskView('active')}>进行中及失败 {activeTasks.length}</Button>
            <Button variant="ghost" type="button" aria-pressed={taskView === 'done'} onClick={() => setTaskView('done')}>已完成 {completedTasks.length}</Button>
          </div>
          {shownTasks.map(task => {
            const draft = drafts.find(item => item.id === task.draftId) ?? (!task.draftId && task.status === 'interrupted' ? drafts.find(item => item.id === task.title) : undefined)
            const batch = data.batches.find(item => item.id === task.batchId)
            const status = { running: task.phase || '创作中', done: draft ? '已生成文章' : '文章已删除或尚未刷新', failed: task.waiting ? '等待处理' : '失败', interrupted: '已中断' }[task.status]
            return <div className="topic-task-row" key={task.id}>
              <div><strong>{task.title}</strong><p>{batch?.batch.request.direction || '选题'} · {status}{task.message ? ` · ${task.message}` : ''}</p></div>
              <div className="topic-task-actions">{task.draftId && (task.status === 'failed' || task.status === 'interrupted') && <Button variant="outline" type="button" disabled={Boolean(retrying)} onClick={() => void retryArticleTask(task.draftId!, false)}>重试</Button>}{task.draftId && task.waiting && <Button variant="outline" type="button" disabled={Boolean(retrying)} onClick={() => void retryArticleTask(task.draftId!, true)}>跳过联网继续</Button>}{draft && <Button variant="outline" type="button" className="topic-secondary-button" onClick={() => onOpen(draft)}>查看文章</Button>}</div>
            </div>
          })}
          {!shownTasks.length && <div className="topic-empty">{taskView === 'active' ? '暂无创作中的任务，勾选选题后创建文章。' : '暂无已完成任务。'}</div>}
        </Card>
      </section>}
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
          if (recordId) batchButtonRef.current?.focus()
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
            <PublishSettings availablePlatforms={availablePlatforms} selected={chosen} onPlatformsChange={setChosen} generateImages={images} onImagesChange={setImages} imageStyle={style} onImageStyleChange={setStyle} disabled={batchBusy}/>
            {batchError && <p role="alert" className="error">{batchError}</p>}
            <div className="form-actions"><div className="creation-actions"><Button type="submit" className="primary-button" disabled={!chosen.length || batchBusy}>批量生成并保存文案</Button></div></div>
          </fieldset></form></Card></div>}
      </SheetContent>
    </Sheet>
  </div>
}
