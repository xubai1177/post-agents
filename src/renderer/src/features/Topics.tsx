import { useEffect, useRef, useState, type FormEvent } from 'react'
import { platforms, type Platform } from '../../../shared/drafts'
import type { ResearchSource } from '../../../shared/research'
import type { TopicBatch, TopicCandidate, TopicEvent, TopicRequest, TopicRunResult } from '../../../shared/topics'

type Phase = TopicEvent['phase']
type Run = { id: string; request: TopicRequest; state: 'running' | 'waiting' | 'completed' | 'failed'; phase: Phase; sources: ResearchSource[]; error?: string; searchFailure?: string; warning?: string; skipped: boolean }
const phaseLabels: Record<Phase, string> = { search: '搜索公开资料', read: '读取来源', generate: '生成候选选题', organize: '整理返回结果' }
const phaseOrder: Phase[] = ['search', 'read', 'generate', 'organize']
export function Topics({ onChoose, onStatus }: { onChoose: (candidate: TopicCandidate, batch: TopicBatch) => void; onStatus: (status: string) => void }) {
  const [direction, setDirection] = useState('')
  const [audience, setAudience] = useState('')
  const [chosen, setChosen] = useState<Platform[]>([...platforms])
  const [run, setRun] = useState<Run | null>(null)
  const [batch, setBatch] = useState<TopicBatch | null>(null)
  const [formError, setFormError] = useState('')
  const currentId = useRef('')
  const runActive = useRef(false)
  useEffect(() => window.topicsApi.onProgress((event) => {
    if (currentId.current !== event.runId) return
    setRun((current) => current?.id === event.runId ? { ...current, phase: event.phase, sources: event.sources ?? current.sources } : current)
  }), [])
  async function finish(promise: Promise<import('../../../shared/settings').Result<TopicRunResult>>, id: string) {
    try {
      const result = await promise
      if (currentId.current !== id) return
      if (!result.ok) { setRun((r) => r?.id === id ? { ...r, state: 'failed', error: result.error } : r); onStatus('选题生成失败'); return }
      if (result.value.status === 'research_failed') { const error = result.value.error; setRun((r) => r?.id === id ? { ...r, state: 'waiting', error } : r); onStatus('选题等待处理'); return }
      const { batch: next, warning } = result.value
      setBatch(next)
      setRun((r) => r?.id === id ? { ...r, state: 'completed', sources: next.sources, skipped: next.skipped, warning } : r)
      onStatus('选题已完成')
    } catch {
      if (currentId.current === id) { setRun((r) => r?.id === id ? { ...r, state: 'failed', error: '选题生成失败，请检查服务后重试。' } : r); onStatus('选题生成失败') }
    } finally { if (currentId.current === id) runActive.current = false }
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (runActive.current || run?.state === 'waiting') return
    if (!direction.trim()) { setFormError('请先填写内容方向。'); return }
    if (!chosen.length) { setFormError('请至少选择一个目标平台。'); return }
    setFormError('')
    const request = { direction: direction.trim(), audience: audience.trim(), platforms: [...chosen] }
    const id = crypto.randomUUID()
    currentId.current = id; runActive.current = true
    setRun({ id, request, state: 'running', phase: 'search', sources: [], skipped: false })
    onStatus('选题生成中')
    void finish(window.topicsApi.start(id, request), id)
  }
  function resume(mode: 'retry' | 'skip') {
    if (!run || run.state !== 'waiting' || runActive.current) return
    runActive.current = true
    setRun({ ...run, state: 'running', phase: mode === 'skip' ? 'generate' : 'search', skipped: mode === 'skip', searchFailure: mode === 'skip' ? run.error : undefined, sources: [], error: undefined })
    onStatus('选题生成中')
    void finish(window.topicsApi.resume(run.id, mode), run.id)
  }
  async function openSource(url: string) {
    try { const result = await window.topicsApi.openSource(url); if (!result.ok) setFormError('无法打开来源链接。') }
    catch { setFormError('无法打开来源链接。') }
  }
  const locked = run?.state === 'running' || run?.state === 'waiting'
  function toggle(platform: Platform) { setChosen((items) => items.includes(platform) ? items.filter((p) => p !== platform) : platforms.filter((p) => p === platform || items.includes(p))) }
  return <div className="page-wrap narrow topic-page">
    <div className="page-title"><div className="eyebrow"><span/> TOPIC IDEAS</div><h1>寻找下一个选题</h1><p>联网搜索公开资料，生成 5 个候选方向，供你挑选和核查。</p></div>
    <form className="form-card" onSubmit={submit}><fieldset disabled={locked} className="settings-fields">
      <label className="field"><span>内容方向 <b>*</b></span><input value={direction} maxLength={100} onChange={(e) => setDirection(e.target.value)} placeholder="例如：北京社保" /></label>
      <label className="field"><span>目标受众 <em>选填</em></span><input value={audience} maxLength={500} onChange={(e) => setAudience(e.target.value)} placeholder="例如：刚参加工作的年轻人" /></label>
      <fieldset className="platform-field"><legend>目标平台 <b>*</b></legend><div className="platform-options">{platforms.map((p) => <button key={p} type="button" className={`platform-option ${chosen.includes(p) ? 'selected' : ''}`} aria-pressed={chosen.includes(p)} onClick={() => toggle(p)}>{p}</button>)}</div></fieldset>
      <div className="form-actions"><span>默认联网搜索；候选仅在本次应用运行期间保留。</span><button type="submit" className="primary-button">{locked ? '处理中…' : batch ? '重新生成选题' : '生成 5 条选题'}</button></div>
    </fieldset></form>
    {formError && <p className="error" role="alert">{formError}</p>}
    {run && <section className="topic-section" aria-label="执行过程"><h2>执行过程</h2><p>方向：{run.request.direction} · 平台：{run.request.platforms.join('、')}</p><ol className="topic-steps" aria-live="polite">{phaseOrder.map((phase, index) => {
      const active = phaseOrder.indexOf(run.phase); const skipped = run.skipped && (phase === 'search' || phase === 'read')
      const isFailure = (run.state === 'waiting' && phase === 'search') || (run.state === 'failed' && phase === run.phase)
      const mark = skipped ? '↷' : isFailure ? '×' : index < active || (run.state === 'completed' && index <= active) ? '✓' : index === active && run.state === 'running' ? '●' : '○'
      return <li key={phase}><span>{mark}</span> {phaseLabels[phase]}</li>
    })}</ol>
    {run.searchFailure && <p>联网搜索失败：{run.searchFailure}</p>}
    {run.skipped && <p>本批选题未使用联网资料，请自行核查。</p>}
    {run.error && <p className="error" role="alert">{run.error}</p>}
    {run.state === 'waiting' && <div className="topic-actions"><button type="button" className="reload-button" onClick={() => resume('retry')}>重试联网</button><button type="button" className="primary-button" onClick={() => resume('skip')}>跳过联网继续</button></div>}
    {run.warning && <p role="status">{run.warning}</p>}
    {run.sources.length > 0 && <details open><summary>本次来源（{run.sources.length}）</summary><ul className="topic-sources">{run.sources.map((source) => <li key={source.url}><button type="button" onClick={() => void openSource(source.url)}>{source.title}</button> <span>{source.fetched ? '已读取网页' : '仅搜索摘要'} · {new Date(source.retrievedAt).toLocaleString('zh-CN')}</span></li>)}</ul></details>}
    </section>}
    {batch && <section className="topic-section" aria-label="候选选题"><h2>候选选题</h2>{run?.state !== 'completed' && <p>以下是上一批成功结果；当前任务不会更改已带入的创作表单。</p>}<p>{batch.skipped ? '本批未使用联网资料。' : `本批参考了 ${batch.sources.length} 条来源。`} 推荐和资料均需人工核查。</p>
      <div className="topic-candidates">{batch.candidates.map((candidate, index) => <article className="topic-candidate" key={`${index}-${candidate.title}`}><h3>{candidate.title}</h3><p><strong>创作角度：</strong>{candidate.angle}</p><p><strong>推荐理由：</strong>{candidate.reason}</p>{candidate.platforms.length > 0 && <p><strong>推荐平台：</strong>{candidate.platforms.join('、')}（仅供参考）</p>}{candidate.sourceIndexes.length > 0 && <div><strong>生成时参考：</strong>{candidate.sourceIndexes.map((n) => <button key={n} type="button" className="topic-source-link" onClick={() => void openSource(batch.sources[n - 1].url)}>{batch.sources[n - 1].title}</button>)}<p>请打开原文，核对内容和适用条件。</p></div>}{candidate.pending.length > 0 && <p><strong>待核事项：</strong>{candidate.pending.join('；')}</p>}<button type="button" className="primary-button" onClick={() => onChoose(candidate, batch)}>用这个选题创作</button></article>)}</div>
    </section>}
  </div>
}
