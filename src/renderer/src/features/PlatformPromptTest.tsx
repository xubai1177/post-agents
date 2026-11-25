import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Icon } from '../components/Icon'
import { useMessage } from '../components/MessageProvider'
import type { Platform, TestPlatformPromptResult } from '../../../shared/drafts'

export function PlatformPromptTest({ platform, kind, rule, body, onBody }: { platform: Platform; kind: 'body' | 'title'; rule: string; body: string; onBody: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState('如何培养每天阅读的习惯')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TestPlatformPromptResult | null>(null)
  const message = useMessage()
  const label = kind === 'body' ? '正文' : '标题'
  async function generate(event: FormEvent) {
    event.preventDefault(); event.stopPropagation()
    if (loading || (kind === 'body' ? !topic.trim() : !body.trim())) return
    setLoading(true); setResult(null)
    try {
      const request = kind === 'body' ? { kind, platform, topic: topic.trim(), rule } as const : { kind, platform, content: body, rule } as const
      const response = await window.draftsApi.testPlatformPrompt(request)
      if (!response.ok) { message(response.error, true); return }
      if (response.value.kind === 'body') onBody(response.value.content)
      setResult(response.value)
    } catch { message('测试生成失败，请检查模型配置后重试。', true) } finally { setLoading(false) }
  }
  return <>
    <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={`测试生成${label}`} onClick={() => { setResult(null); setOpen(true) }}><Icon name="spark" size={16}/></Button></TooltipTrigger><TooltipContent>测试生成{label}</TooltipContent></Tooltip>
    <Dialog open={open} onOpenChange={value => { if (!loading) setOpen(value) }}>
      <DialogContent className="platform-test-dialog" onEscapeKeyDown={event => { if (loading) event.preventDefault() }} onInteractOutside={event => { if (loading) event.preventDefault() }} showCloseButton={!loading}>
        <header className="platform-test-header"><div><div className="platform-test-title"><DialogTitle>测试生成{label}</DialogTitle><span className="platform-test-platform">{platform}</span></div><DialogDescription>{kind === 'body' ? '使用当前正文规则生成测试内容，不会保存为文章。' : '使用测试生成的正文和当前标题规则生成候选标题。'}</DialogDescription></div></header>
        <div className="platform-test-body">
          <form onSubmit={generate} className="platform-test-form">
            {kind === 'body' ? <><Label htmlFor="platform-test-topic">测试主题</Label><Input id="platform-test-topic" value={topic} onChange={event => setTopic(event.target.value)} maxLength={100} placeholder="输入文章主题…" disabled={loading}/></> : <><Label htmlFor="platform-test-body">测试正文</Label><textarea id="platform-test-body" className="platform-test-source" value={body} readOnly rows={5} placeholder="请先测试生成正文…"/></>}
            <div className="platform-test-actions"><Button type="submit" size="sm" disabled={loading || (kind === 'body' ? !topic.trim() : !body.trim())}>{loading ? '生成中…' : `生成${label}`}</Button></div>
          </form>
          {loading && <div className="platform-test-status" role="status"><Icon name="loading" size={16} className="animate-spin motion-reduce:animate-none"/>正在生成，请稍候…</div>}
          {result && <section className="platform-test-result" aria-label="生成结果"><div className="platform-test-result-heading">生成结果</div>{result.kind === 'body' ? <div className="platform-test-content">{result.content}</div> : <ol className="platform-test-titles">{result.titles.map((title, index) => <li key={`${index}-${title}`}>{title}</li>)}</ol>}</section>}
        </div>
      </DialogContent>
    </Dialog>
  </>
}
