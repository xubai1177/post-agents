import { useEffect, useState } from 'react'
import type { ResearchRecord } from '../../../shared/research'

export function ResearchPanel({ draftId }: { draftId: string }) {
  const [record, setRecord] = useState<ResearchRecord | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    window.draftsApi.research(draftId).then((result) => { if (!active) return; if (result.ok) setRecord(result.value); else setError('无法读取核查资料。') }).catch(() => { if (active) setError('无法读取核查资料。') })
    return () => { active = false }
  }, [draftId])
  async function open(url: string) { const result = await window.draftsApi.openSource(draftId, url); if (!result.ok) setError('无法打开来源链接。') }
  return <section className="research-panel" aria-label="核查资料"><h2>核查资料</h2>{error && <p className="error" role="alert">{error}</p>}{!record ? <p>没有保存的联网核查记录，请自行核查来源。</p> : <><p>{record.status === 'skipped' ? '本次跳过联网核查，请自行查证。' : `已检索到 ${record.sources.length} 个来源，查询时间：${new Date(record.checkedAt).toLocaleString('zh-CN')}。检索结果和文案仍需人工核查。`}</p>{record.sources.length > 0 && <ul>{record.sources.map((source) => <li key={source.url}><button type="button" onClick={() => void open(source.url)}>{source.title}</button><span>{source.fetched ? '已读取网页' : '仅搜索摘要'}</span></li>)}</ul>}{record.pending.length > 0 && <div><strong>待核事项</strong><ul>{record.pending.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}{record.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</>}</section>
}
