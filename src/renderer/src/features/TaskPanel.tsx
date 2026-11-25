import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ArticleRun, Draft } from '../../../shared/drafts'
import type { ImageJob } from '../../../shared/images'
import type { TopicWorkspace } from '../../../shared/topics'
import { useMessage } from '../components/MessageProvider'

const statusText = { queued: '排队中', running: '进行中', waiting: '等待处理', done: '已完成', failed: '失败', interrupted: '已中断' } as const
const articlePhase = { research: '检索资料', plan: '规划内容', write: '撰写文案', review: '检查内容', save: '保存文章', images: '生成配图' } as const
const topicPhase = { search: '搜索资料', read: '读取来源', generate: '生成选题', organize: '整理结果' } as const

type Props = { workspaceVersion: number; runs: ArticleRun[]; drafts: Draft[]; onOpenArticle: (draft: Draft) => void }
export function TaskPanel({ workspaceVersion, runs, drafts, onOpenArticle }: Props) {
  const [topics, setTopics] = useState<TopicWorkspace>({ version: 1, batches: [], tasks: [] })
  const [images, setImages] = useState<ImageJob[]>([])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [retrying, setRetrying] = useState('')
  const [category, setCategory] = useState(0)
  const [filter, setFilter] = useState<'all' | 'active' | 'attention' | 'done'>('all')
  const sequence = useRef(0)
  const showMessage = useMessage()
  useEffect(() => {
    let active = true
    setTopics({ version: 1, batches: [], tasks: [] }); setImages([]); setError(''); setLoaded(false)
    async function refresh() {
      const id = ++sequence.current
      try {
        const [topicResult, imageResult] = await Promise.all([window.topicsApi.readRecords(), window.imagesApi.jobs()])
        if (!active || id !== sequence.current) return
        if (topicResult.ok) setTopics(topicResult.value)
        if (imageResult.ok) setImages(imageResult.value)
        setError(!topicResult.ok ? topicResult.error : !imageResult.ok ? imageResult.error : ''); setLoaded(true)
      } catch { if (active && id === sequence.current) { setError('无法读取任务状态，请检查工作空间。'); setLoaded(true) } }
    }
    const offTopic = window.topicsApi.onChanged(() => { void refresh() })
    const offImages = window.imagesApi.onJobsChanged(() => { void refresh() })
    void refresh()
    return () => { active = false; sequence.current++; offTopic(); offImages() }
  }, [workspaceVersion])
  async function retry(kind: 'article' | 'topic', id: string, skip: boolean) {
    if (retrying) return
    setRetrying(id)
    try {
      const result = kind === 'article' ? await window.draftsApi.retryArticle(id, skip) : await window.topicsApi.retry(id, skip ? 'skip' : 'retry')
      if (!result.ok) showMessage(result.error, true)
      else showMessage('任务已加入队列。')
    } catch { showMessage('无法重试任务，请检查工作空间。', true) }
    finally { setRetrying('') }
  }
  const unlinked = topics.tasks.filter(task => !task.draftId || !runs.some(run => run.id === task.draftId))
  const groups = [
    { title: '文章生成', rows: [...runs.map(run => ({ id: run.id, title: run.request.title, status: run.status, detail: run.status === 'running' ? (run.imageProgress || articlePhase[run.phase ?? 'research']) : run.message, run })), ...unlinked.map(task => ({ id: task.id, title: task.title, status: task.status, detail: task.message ?? task.phase }))] },
    { title: '选题生成', rows: (topics.topicRuns ?? []).map(task => ({ id: task.id, title: task.request.direction, status: task.status, detail: task.status === 'running' ? topicPhase[task.phase] : task.message, topic: task })) },
    { title: '配图生成', rows: images.map(job => ({ id: `${job.id}:${job.platform}`, title: `${drafts.find(draft => draft.id === job.id)?.title ?? job.id} · ${job.platform}`, status: job.status, detail: job.status === 'running' ? (job.progress?.phase === 'generating' ? `正在生成第 ${job.progress.current} / ${job.progress.total} 张` : '正在策划配图') : job.message })) },
  ]
  const group = groups[category]
  const shown = group.rows.filter(row => filter === 'all' || (filter === 'active' && (row.status === 'queued' || row.status === 'running')) || (filter === 'attention' && (row.status === 'waiting' || row.status === 'failed' || row.status === 'interrupted')) || (filter === 'done' && row.status === 'done'))
  const filters = [{ id: 'all', label: '全部' }, { id: 'active', label: '进行中' }, { id: 'attention', label: '需处理' }, { id: 'done', label: '已完成' }] as const
  return <section className="task-page" aria-label="任务面板">
    <div className="task-category-nav" role="group" aria-label="任务类型">{groups.map((item, index) => <Button key={item.title} variant="ghost" type="button" aria-pressed={category === index} onClick={() => { setCategory(index); setFilter('all') }}>{item.title}<span>{item.rows.length}</span></Button>)}</div>
    <div className="task-list-header"><div className="task-list-title"><h2>{group.title}</h2><span>{shown.length} 项</span></div><div className="task-filters" role="group" aria-label="任务状态">{filters.map(item => <Button key={item.id} variant="ghost" type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</Button>)}</div></div>
    {error && <p className="task-panel-error" role="alert">{error}</p>}
    <div className="task-list" aria-label={`${group.title}任务列表`}>
      {!loaded && <p className="task-panel-empty" role="status">正在读取任务…</p>}
      {loaded && !shown.length && !error && <p className="task-panel-empty" role="status">暂无符合条件的任务</p>}
      {shown.length > 0 && <div className="task-list-columns" aria-hidden="true"><span>任务</span><span>状态</span><span>操作</span></div>}
      <ul className="task-list-items">{shown.map(row => <li className="task-row" key={row.id}><strong className="task-row-title">{row.title}</strong><span className={`task-status task-status-${row.status}`}><span className="task-status-dot" aria-hidden="true"/>{statusText[row.status]}</span>
          {row.detail && <p>{row.detail}</p>}
          {'run' in row && row.run && <div className="task-row-actions">{['failed', 'waiting', 'interrupted'].includes(row.run.status) && <><Button className="task-action-primary" variant="ghost" size="sm" disabled={!!retrying} onClick={() => void retry('article', row.id, false)}>重试</Button>{row.run.status === 'waiting' && <Button variant="ghost" size="sm" disabled={!!retrying} onClick={() => void retry('article', row.id, true)}>跳过联网继续</Button>}</>}{row.run.status !== 'queued' && row.run.status !== 'running' && drafts.some(draft => draft.id === row.id) && <Button className={row.run.status === 'done' ? 'task-open-button' : 'task-action-primary'} variant={row.run.status === 'done' ? 'default' : 'ghost'} size="sm" onClick={() => { const draft = drafts.find(item => item.id === row.id); if (draft) { onOpenArticle(draft) } }}>{row.run.status === 'done' ? '打开文章' : '查看已有内容'}</Button>}</div>}
          {'topic' in row && row.topic && ['failed', 'waiting', 'interrupted'].includes(row.topic.status) && <div className="task-row-actions"><Button className="task-action-primary" variant="ghost" size="sm" disabled={!!retrying} onClick={() => void retry('topic', row.id, false)}>重试</Button>{row.topic.status === 'waiting' && <Button variant="ghost" size="sm" disabled={!!retrying} onClick={() => void retry('topic', row.id, true)}>跳过联网继续</Button>}</div>}
        </li>)}</ul>
    </div>
  </section>
}
