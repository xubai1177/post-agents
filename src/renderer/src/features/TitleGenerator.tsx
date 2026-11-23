import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Icon } from '../components/Icon'
import { useMessage } from '../components/MessageProvider'
import type { Draft, Platform } from '../../../shared/drafts'
import type { OpenDocument } from './types'

export function TitleGenerator({ draft, platform, title, document, busy, onBusy, onApply }: { draft: Draft; platform: Platform; title: string | null; document: OpenDocument; busy: boolean; onBusy: (value: boolean) => void; onApply: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [candidates, setCandidates] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const base = useRef<{ title: string | null; storedTitle: string | null; content: string; version: string } | null>(null)
  const current = useRef({ title, document }); current.current = { title, document }
  const message = useMessage()
  async function generate() {
    if (!document.content.trim()) { message('请先填写文章内容。', true); return }
    if (document.content.length > 60000) { message('文章内容不能超过 6 万字符。', true); return }
    if (typeof window.draftsApi?.generateTitles !== 'function') { message('应用尚未加载标题生成功能，请重启灵稿 AI 后重试。', true); return }
    setOpen(true); setLoading(true); setCandidates([]); setSelected(''); onBusy(true)
    try {
      const snapshot = { title, content: document.content, version: document.version }
      const stored = await window.draftsApi.readTitle(draft.id, platform)
      if (!stored.ok) { message(stored.error, true); setOpen(false); return }
      const result = await window.draftsApi.generateTitles({ id: draft.id, platform, content: snapshot.content, version: snapshot.version })
      if (!result.ok) { message(result.error, true); setOpen(false); return }
      base.current = { ...snapshot, storedTitle: stored.value }; setCandidates(result.value)
    } catch (error) {
      if (error instanceof Error && /No handler registered for ['"]?drafts:generate-titles/i.test(error.message)) message('应用尚未加载标题生成功能，请重启灵稿 AI 后重试。', true)
      else { console.error('调用标题生成功能失败', error); message('标题生成调用失败，请重启应用后重试。', true) }
      setOpen(false)
    } finally { setLoading(false); onBusy(false) }
  }
  async function apply() {
    const snapshot = base.current
    if (!snapshot || !selected) return
    setLoading(true); onBusy(true)
    try {
      const [stored, latest] = await Promise.all([window.draftsApi.readTitle(draft.id, platform), window.draftsApi.read(draft.id, platform)])
      if (!stored.ok || !latest.ok) { message('无法检查文章，请重试。', true); return }
      if (stored.value !== snapshot.storedTitle || latest.value.version !== snapshot.version || current.current.title !== snapshot.title || current.current.document.content !== snapshot.content || current.current.document.version !== snapshot.version) { message('文章或标题已变化，请重新生成标题。', true); setOpen(false); return }
      onApply(selected); setOpen(false)
    } catch { message('无法检查文章，请重试。', true) } finally { setLoading(false); onBusy(false) }
  }
  return <>
    <Button type="button" variant="ghost" size="icon-sm" className="title-ai-trigger" aria-label={`AI 生成${platform}标题`} title="AI 生成标题" disabled={busy || title === null} onClick={() => void generate()}><Icon name="spark" size={16}/></Button>
    <Dialog open={open} onOpenChange={value => { if (!loading) setOpen(value) }}>
      <DialogContent className="style-dialog title-generator-dialog" onInteractOutside={event => { if (loading) event.preventDefault() }} onEscapeKeyDown={event => { if (loading) event.preventDefault() }} showCloseButton={false}>
        <div className="title-generator-content"><div className="title-generator-header"><div className="title-generator-heading"><span className="title-generator-icon" aria-hidden="true"><Icon name="spark" size={17}/></span><DialogTitle>AI 生成标题</DialogTitle></div><Button variant="ghost" size="icon-sm" className="title-generator-close" aria-label="关闭" disabled={loading} onClick={() => setOpen(false)}><Icon name="close" size={17}/></Button></div><DialogDescription className="sr-only">选择一个标题，确认后替换当前平台标题。</DialogDescription>
          {loading && !candidates.length ? <div className="title-generator-loading" role="status"><Icon name="loading" size={16} className="animate-spin motion-reduce:animate-none"/>正在生成标题…</div> : <fieldset className="title-generator-list"><legend className="sr-only">选择标题</legend>{candidates.map((item, index) => <label key={`${index}-${item}`} className={`title-generator-option ${selected === item ? 'selected' : ''}`}><input type="radio" name="generated-title" value={item} checked={selected === item} onChange={() => setSelected(item)} /><span className="title-generator-index">{String(index + 1).padStart(2, '0')}</span><span className="title-generator-text">{item}</span><span className="title-generator-radio" aria-hidden="true"/></label>)}</fieldset>}
          <div className="title-generator-actions"><Button className="title-generator-cancel" variant="outline" disabled={loading} onClick={() => setOpen(false)}>取消</Button><Button className="title-generator-apply" disabled={loading || !selected} onClick={() => void apply()}>使用标题</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
