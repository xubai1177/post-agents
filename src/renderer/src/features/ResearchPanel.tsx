import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useEffect, useState } from 'react'
import type { Platform } from '../../../shared/drafts'
import type { ResearchRecord } from '../../../shared/research'

export function ResearchPanel({ draftId, platform }: { draftId: string; platform: Platform }) {
  const [record, setRecord] = useState<ResearchRecord | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    window.draftsApi.research(draftId, platform).then((result) => { if (!active) return; if (result.ok) setRecord(result.value); else setError('无法读取核查资料。') }).catch(() => { if (active) setError('无法读取核查资料。') })
    return () => { active = false }
  }, [draftId, platform])
  async function open(url: string) { const result = await window.draftsApi.openSource(draftId, url, platform); if (!result.ok) setError('无法打开来源链接。') }
  return <Card asChild><section className="research-panel" aria-label="核查资料"><h2>核查资料</h2>{error && <p className="error" role="alert">{error}</p>}{!record ? <p>没有保存的联网核查记录，请自行核查来源。</p> : <>{record.legacy && <p>旧版共享来源，无法确定与各平台的对应关系。</p>}{record.stale && <p role="status">文章已变化，以下为生成时的来源，请重新核对。</p>}{record.searchPlan && <details><summary>查看搜索计划</summary><p>{record.searchPlan}</p></details>}<p>{record.status === 'skipped' ? '本次跳过联网核查，请自行查证。' : `已检索到 ${record.sources.length} 个来源，查询时间：${new Date(record.checkedAt).toLocaleString('zh-CN')}。检索结果和文案仍需人工核查。`}</p>{record.sources.length > 0 && <ul>{record.sources.map((source) => <li key={source.url}><Button variant="ghost" type="button" onClick={() => void open(source.url)}>{source.title}</Button><span>{source.origin === 'model_search_unlinked' ? '模型联网来源，未逐条关联摘要' : source.origin === 'model_search' ? '模型联网整理，请核查原文' : source.fetched ? '已读取网页' : '仅搜索摘要'}</span></li>)}</ul>}{record.trace && <details><summary>生成记录</summary><div className="generation-trace">{([['正文规则', record.trace.platformPrompt], ['标题规则', record.trace.titlePrompt], ['本次要求', record.trace.instruction || '无'], ['关键事实', record.trace.commonFacts || '无'], ['写作策划', record.trace.outline || '无'], ['初稿标题', record.trace.initialTitle], ['初稿正文', record.trace.initialContent], ['审查建议', record.trace.reviewFeedback || '无或未完成，请结合核查记录确认'], ['生成时正文', record.trace.finalContent]] as const).map(([label, value]) => <details key={label}><summary>{label}</summary><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value}</p></details>)}</div></details>}{record.pending.length > 0 && <div><strong>待核事项</strong><ul>{record.pending.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}{record.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</>}</section></Card>
}
