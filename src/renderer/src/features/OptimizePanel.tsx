import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Icon } from '../components/Icon'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useRef, useState } from 'react'
import type { Draft, Platform } from '../../../shared/drafts'
import type { OpenDocument } from './types'

export function OptimizePanel({ draft, platform, document, busy, onBusy, onApply }: { draft: Draft; platform: Platform; document: OpenDocument; busy: boolean; onBusy: (value: boolean) => void; onApply: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const instructionRef = useRef<HTMLTextAreaElement>(null)
  const [instruction, setInstruction] = useState('')
  const [candidate, setCandidate] = useState<{ content: string; base: string; version: string } | null>(null)
  const [message, setMessage] = useState('')
  const current = useRef(document); current.current = document
  async function optimize() {
    const base = document.content, version = document.version
    if (!base.trim()) { setMessage('文章内容为空，请先填写内容。'); return }
    if (base.length > 60000) { setMessage('文章超过优化长度限制（6 万字符）。'); return }
    setCandidate(null); onBusy(true); setMessage('正在整理文章并生成优化候选…')
    try {
      const result = await window.draftsApi.optimize({ id: draft.id, platform, content: base, version, instruction: instruction.trim() })
      if (!result.ok) { setMessage(result.error); return }
      setCandidate({ content: result.value, base, version }); setMessage('')
    } catch { setMessage('优化失败，请检查模型配置后重试。') } finally { onBusy(false) }
  }
  function apply() {
    if (!candidate) return
    if (current.current.content !== candidate.base || current.current.version !== candidate.version) { setMessage('文章已变化，请重新生成优化候选。'); return }
    onApply(candidate.content); setCandidate(null); setMessage(''); setOpen(false)
  }
  return <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}>
    <DialogTrigger asChild><Button ref={triggerRef} variant="secondary" className="article-optimize-trigger" disabled={busy}><span aria-hidden="true">✦</span> 优化文章</Button></DialogTrigger>
    <DialogContent className="style-dialog article-optimize-dialog max-w-none sm:max-w-none" showCloseButton={false}
      onCloseAutoFocus={event => { event.preventDefault(); triggerRef.current?.focus() }}
      onOpenAutoFocus={event => { event.preventDefault(); instructionRef.current?.focus() }}
      onInteractOutside={event => event.preventDefault()}
      onEscapeKeyDown={event => { if (busy) event.preventDefault() }}>
<section className="article-optimize-content">
  <div className="article-optimize-header">
    <DialogTitle>优化文章</DialogTitle>
    <DialogDescription className="sr-only">生成候选内容，确认后再应用。</DialogDescription>
    <Button variant="ghost" size="icon-sm" type="button" className="article-dialog-close" aria-label="关闭优化文章" disabled={busy} onClick={() => setOpen(false)}><Icon name="close" size={16}/></Button>
  </div>
  <div className="article-optimize-label"><Label htmlFor="optimize-instruction">优化要求</Label><span>选填</span></div>
  <div className="article-optimize-composer">
    <Textarea id="optimize-instruction" ref={instructionRef} value={instruction} maxLength={1000} disabled={busy} onChange={(event) => setInstruction(event.target.value)} placeholder="例如：让表达更简洁，保留关键信息" />
    <div className="article-optimize-generate"><Button type="button" className="primary-button" disabled={busy} onClick={() => void optimize()}><Icon name="spark" size={15}/>{busy ? '生成中…' : '生成候选'}</Button></div>
  </div>
  {message && <p className="article-optimize-message" role="status" aria-live="polite">{message}</p>}{candidate && <div className="optimize-candidate"><div className="article-candidate-heading"><strong>优化候选</strong><small>请核查内容</small></div><pre>{candidate.content}</pre><details className="optimization-original"><summary>查看原文</summary><pre>{candidate.base}</pre></details><div className="article-candidate-actions"><Button variant="outline" type="button" className="article-secondary-button" disabled={busy} onClick={() => { setCandidate(null); setMessage(''); instructionRef.current?.focus() }}>放弃</Button><Button type="button" className="primary-button" disabled={busy} onClick={apply}>应用候选</Button></div></div>}</section></DialogContent></Dialog>
}
