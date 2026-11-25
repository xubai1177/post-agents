import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ArticleRun, Draft, DraftActivity } from '../../../shared/drafts'
import type { ImageJob } from '../../../shared/images'
import type { TopicWorkspace } from '../../../shared/topics'
import { Icon } from '../components/Icon'
import { platformCounts, recentTopicDays, taskCounts } from './dashboard-data'

type Props = {
  workspace: string; workspaceVersion?: number; articleDataReady?: boolean; runsReady?: boolean; drafts: Draft[]; runs?: ArticleRun[]; titles: Record<string, string>; loading: boolean; busy: boolean
  onCreate: () => void; onTopics: () => void; onTasks?: () => void; onOpen: (draft: Draft) => void; onOpenWorkspace: () => void
}
export function WorkspaceHome({ workspace, workspaceVersion = 0, articleDataReady = true, runsReady = true, drafts, runs = [], titles, loading, busy, onCreate, onTopics, onTasks, onOpen, onOpenWorkspace }: Props) {
  const [topics, setTopics] = useState<TopicWorkspace | null>(null)
  const [images, setImages] = useState<ImageJob[] | null>(null)
  const [activity, setActivity] = useState<DraftActivity[] | null>(null)
  const [errors, setErrors] = useState({ topics: false, images: false, activity: false })
  const loadError = errors.topics || errors.images || errors.activity
  useEffect(() => {
    setTopics(null); setImages(null); setActivity(null); setErrors({ topics: false, images: false, activity: false })
    if (!workspace) return
    let active = true, topicSequence = 0, imageSequence = 0
    async function readTopics() {
      const request = ++topicSequence
      try { const result = await window.topicsApi.readRecords(); if (!active || request !== topicSequence) return; setTopics(result.ok ? result.value : null); setErrors(current => ({ ...current, topics: !result.ok })) }
      catch { if (active && request === topicSequence) { setTopics(null); setErrors(current => ({ ...current, topics: true })) } }
    }
    async function readImages() {
      const request = ++imageSequence
      try { const result = await window.imagesApi.jobs(); if (!active || request !== imageSequence) return; setImages(result.ok ? result.value : null); setErrors(current => ({ ...current, images: !result.ok })) }
      catch { if (active && request === imageSequence) { setImages(null); setErrors(current => ({ ...current, images: true })) } }
    }
    async function readActivity() {
      try { const result = await window.draftsApi.activity(); if (!active) return; setActivity(result.ok ? result.value : null); setErrors(current => ({ ...current, activity: !result.ok })) }
      catch { if (active) { setActivity(null); setErrors(current => ({ ...current, activity: true })) } }
    }
    const offTopics = window.topicsApi.onChanged(() => { void readTopics() })
    const offImages = window.imagesApi.onJobsChanged(() => { void readImages() })
    void readTopics(); void readImages(); void readActivity()
    return () => { active = false; offTopics(); offImages() }
  }, [workspace, workspaceVersion])
  const tasks = topics && images && runsReady ? taskCounts(runs, topics, images) : null
  const dayData = topics ? recentTopicDays(topics) : []
  const maximumDay = Math.max(1, ...dayData.map(day => day.count))
  const distributions = platformCounts(drafts)
  const maxPlatform = Math.max(1, ...distributions.map(item => item.count))
  const recent = (activity ?? []).map(item => ({ ...item, draft: drafts.find(draft => draft.id === item.id) })).filter((item): item is DraftActivity & { draft: Draft } => Boolean(item.draft) && !runs.some(run => run.id === item.id && (run.status === 'queued' || run.status === 'running'))).slice(0, 5)
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' })
  const showData = Boolean(workspace)
  return <section className="dashboard" aria-labelledby="dashboard-title">
    <header className="dashboard-header"><div><h1 id="dashboard-title">创作总览</h1><p>{workspace || '选择工作区后查看创作数据'}</p></div><div className="dashboard-actions">{showData ? <><Button type="button" variant="outline" disabled={busy} onClick={onTopics}><Icon name="bulb" size={16}/>生成选题</Button><Button type="button" disabled={busy} onClick={onCreate}><Icon name="plus" size={16}/>新建文章</Button></> : <Button type="button" disabled={busy} onClick={onOpenWorkspace}>打开工作区</Button>}</div></header>
    {loadError && <p className="dashboard-error" role="status">部分数据读取失败，请检查工作区后重新打开首页。</p>}
    <div className="dashboard-metrics" aria-label="创作概览">
      <div className="dashboard-metric"><span>文章总数</span><strong>{loading || !showData || !articleDataReady ? '—' : drafts.length}</strong><small>当前工作区</small></div>
      <div className="dashboard-metric"><span>选题记录</span><strong>{topics ? topics.batches.length : '—'}</strong><small>已完成的选题记录</small></div>
      <div className="dashboard-metric"><span>进行中任务</span><strong>{tasks ? tasks.active : '—'}</strong><small>排队中及生成中</small></div>
      <div className="dashboard-metric"><span>待处理任务</span><strong>{tasks ? tasks.attention : '—'}</strong><small>等待处理、失败或中断</small></div>
    </div>
    <div className="dashboard-grid">
      <section className="dashboard-panel dashboard-trend" aria-labelledby="dashboard-trend-title"><div className="dashboard-panel-head"><div><h2 id="dashboard-trend-title">选题记录</h2><p>最近 7 天的记录创建数量</p></div><Button variant="ghost" size="sm" type="button" onClick={onTopics} disabled={busy || !showData}>查看选题 <Icon name="arrow" size={14}/></Button></div>
        {topics ? <><div className="dashboard-bars" role="img" aria-label={`最近 7 天选题记录：${dayData.map(day => `${day.label}，${day.count} 条`).join('；')}`}>{dayData.map(day => <div className="dashboard-bar-column" key={day.key}><span className="dashboard-bar-value">{day.count}</span><div className="dashboard-bar-track"><span className="dashboard-bar" style={{ height: `${day.count ? Math.max(5, day.count / maximumDay * 100) : 0}%` }}/></div><span className="dashboard-bar-label">{day.label}</span></div>)}</div>{!dayData.some(day => day.count) && <p className="dashboard-chart-note">近 7 天暂无选题记录</p>}</> : <p className="dashboard-placeholder">{!showData ? '打开工作区后查看选题记录。' : errors.topics ? '选题数据暂不可用' : '正在读取选题记录…'}</p>}
      </section>
      <section className="dashboard-panel dashboard-tasks" aria-labelledby="dashboard-tasks-title"><div className="dashboard-panel-head"><div><h2 id="dashboard-tasks-title">任务状态</h2><p>文章、选题与配图任务</p></div><Button variant="ghost" size="sm" type="button" onClick={onTasks} disabled={busy || !showData}>查看任务 <Icon name="arrow" size={14}/></Button></div>
        {tasks ? <><div className="dashboard-task-total"><strong>{tasks.active + tasks.attention + tasks.done}</strong><span>项任务</span></div><div className="dashboard-task-track" aria-hidden="true">{([['active', tasks.active], ['attention', tasks.attention], ['done', tasks.done]] as const).map(([key, count]) => <span key={key} data-kind={key} style={{ flexGrow: count }}/>)}</div><div className="dashboard-task-legend">{([['active', '进行中', tasks.active], ['attention', '待处理', tasks.attention], ['done', '已完成', tasks.done]] as const).map(([key, name, count]) => <div key={key}><i data-kind={key} aria-hidden="true"/><span>{name}</span><strong>{count}</strong></div>)}</div><p className="dashboard-footnote">配图任务仅统计本次运行的数据</p></> : <p className="dashboard-placeholder">{!showData ? '打开工作区后查看任务。' : (errors.topics || errors.images || !runsReady) ? '任务数据暂不可用' : '正在读取任务…'}</p>}
      </section>
      <section className="dashboard-panel dashboard-platforms" aria-labelledby="dashboard-platforms-title"><div className="dashboard-panel-head"><div><h2 id="dashboard-platforms-title">平台分布</h2><p>按文章包含的平台统计</p></div></div><div className="dashboard-platform-list">{distributions.map(item => <div className="dashboard-platform-row" key={item.platform}><span>{item.platform}</span><div className="dashboard-platform-track" aria-hidden="true"><span style={{ width: `${articleDataReady && showData ? item.count / maxPlatform * 100 : 0}%` }}/></div><strong>{loading || !showData || !articleDataReady ? '—' : item.count}</strong></div>)}</div><p className="dashboard-footnote">一篇文章可包含多个平台</p></section>
      <section className="dashboard-panel dashboard-recent" aria-labelledby="dashboard-recent-title"><div className="dashboard-panel-head"><div><h2 id="dashboard-recent-title">最近修改</h2><p>按正文文件的最近修改时间排序</p></div></div>{activity && articleDataReady && runsReady ? recent.length ? <div className="dashboard-recent-list">{recent.map(item => <Button variant="ghost" type="button" className="dashboard-recent-row" key={item.id} disabled={busy} onClick={() => onOpen(item.draft)}><Icon name="file" size={16}/><span>{titles[item.id] ?? item.draft.title}</span><time dateTime={item.updatedAt}>{date.format(new Date(item.updatedAt))}</time><Icon name="arrow" size={14}/></Button>)}</div> : <p className="dashboard-placeholder">暂无文章</p> : <p className="dashboard-placeholder">{!showData ? '打开工作区后查看文章。' : (errors.activity || !articleDataReady || !runsReady) ? '文章修改时间暂不可用' : '正在读取文章…'}</p>}</section>
    </div>
  </section>
}
