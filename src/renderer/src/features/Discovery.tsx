import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronDown, Download, ExternalLink, ImagePlus, LogIn, LogOut, Search, Sparkles, UserRound } from 'lucide-react'
import type { DiscoveryAccount, DiscoveryDetail, DiscoveryItem } from '../../../shared/discovery'
import type { Draft } from '../../../shared/drafts'


function DiscoveryImage({ id, index, alt, className }: { id: string; index: number; alt: string; className: string }) {
  const [data, setData] = useState<string | null | undefined>(undefined)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let active = true, requested = false
    setData(undefined)
    const load = () => { if (requested) return; requested = true; void window.discoveryApi.image(id, index).then(result => { if (active) setData(result.ok ? result.value : null) }).catch(() => { if (active) setData(null) }) }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load() } }, { rootMargin: '120px' })
    if (ref.current) observer.observe(ref.current)
    return () => { active = false; observer.disconnect() }
  }, [id, index])
  return <div ref={ref} className={className}>{data ? <img src={data} alt={alt}/> : <span className="discovery-image-placeholder" aria-hidden="true">{data === null ? '图片暂不可用' : '加载中…'}</span>}</div>
}

export function Discovery({ onSaved, onBusy }: { onSaved: (draft: Draft) => void; onBusy: (busy: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<DiscoveryItem[]>([])
  const [selected, setSelected] = useState<DiscoveryDetail | null>(null)
  const [candidate, setCandidate] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [searched, setSearched] = useState(false)
  const [account, setAccount] = useState<DiscoveryAccount>({ state: 'unknown' })
  const [imageIndex, setImageIndex] = useState(0)
  const [imageCandidate, setImageCandidate] = useState<{ token: string; dataUrl: string; index: number } | null>(null)
  const [imageError, setImageError] = useState('')
  const [rewrittenImage, setRewrittenImage] = useState<{ token: string; dataUrl: string; index: number } | null>(null)
  const [rewriteImageMessage, setRewriteImageMessage] = useState('')
  const [exportMessage, setExportMessage] = useState('')
  const accountRequest = useRef(0)
  useEffect(() => {
    let active = true
    function refreshAccount() {
      const request = ++accountRequest.current
      void window.discoveryApi.account().then(result => { if (active && request === accountRequest.current) setAccount(result.ok ? result.value : { state: 'unknown' }) }).catch(() => { if (active && request === accountRequest.current) setAccount({ state: 'unknown' }) })
    }
    refreshAccount()
    window.addEventListener('focus', refreshAccount)
    return () => { active = false; window.removeEventListener('focus', refreshAccount) }
  }, [])
  async function run(label: string, action: () => Promise<void>) {
    if (busy) return
    setBusy(label); onBusy(true); setMessage('')
    try { await action() } catch { setMessage('操作失败，请检查网络或稍后重试。') } finally { setBusy(''); onBusy(false) }
  }
  async function search() {
    if (!query.trim()) { setMessage('请输入要搜索的主题。'); return }
    setItems([]); setSelected(null); setCandidate(''); setImageCandidate(null); setRewrittenImage(null); setRewriteImageMessage(''); setSearched(false)
    await run('正在搜索小红书…', async () => {
      const result = await window.discoveryApi.search(query.trim())
      if (!result.ok) { setMessage(result.error); return }
      setItems(result.value); setSelected(null); setCandidate(''); setSearched(true)
    })
  }
  async function select(item: DiscoveryItem) {
    await run('正在读取帖子…', async () => {
      const result = await window.discoveryApi.detail(item.id)
      if (!result.ok) { setMessage(result.error); return }
      setSelected(result.value); setCandidate(''); setImageCandidate(null); setRewrittenImage(null); setRewriteImageMessage(''); setExportMessage(''); setImageIndex(0); setTitle(result.value.title.slice(0, 100))
    })
  }
  async function exportPost() {
    if (!selected) return
    setExportMessage('')
    await run('正在保存帖子内容和图片…', async () => {
      const result = await window.discoveryApi.exportOriginal(selected.id)
      if (!result.ok) { setExportMessage(result.error); return }
      if (result.value) {
        const { folder, savedImages, failedImages } = result.value
        setExportMessage(`已保存到“${folder}”：正文和 ${savedImages} 张图片${failedImages ? `，${failedImages} 张图片保存失败，请重试。` : '。'}`)
      }
    })
  }
  async function rewrite() {
    if (!selected) return
    await run('正在生成改写候选…', async () => {
      const result = await window.discoveryApi.rewrite(selected.id)
      if (!result.ok) { setMessage(result.error); return }
      setCandidate(result.value); setImageCandidate(null)
    })
  }
  async function rewriteCurrentImage() {
    if (!selected) return
    setRewriteImageMessage('')
    await run('正在参考帖子图片生成新图…', async () => {
      const result = await window.discoveryApi.rewriteImage(selected.id, imageIndex)
      if (!result.ok) { setRewriteImageMessage(result.error); return }
      setRewrittenImage({ ...result.value, index: imageIndex })
    })
  }
  async function downloadCurrentImage() {
    if (!selected || !rewrittenImage) return
    setRewriteImageMessage('')
    await run('正在保存图片…', async () => {
      const result = await window.discoveryApi.downloadRewrittenImage(selected.id, rewrittenImage.token)
      setRewriteImageMessage(!result.ok ? result.error : result.value ? `已保存：${result.value}` : '')
    })
  }
  async function generateImage() {
    if (!selected || !candidate.trim() || !title.trim()) { setMessage('请先生成改写候选并填写标题。'); return }
    setImageCandidate(null); setImageError('')
    await run('正在识别参考图片并生成新图，可能需要一些时间…', async () => {
      const result = await window.discoveryApi.generateImage({ id: selected.id, index: imageIndex, title: title.trim(), content: candidate })
      if (!result.ok) { setImageError(result.error); return }
      setImageCandidate({ ...result.value, index: imageIndex })
    })
  }
  async function save() {
    if (!selected || !candidate.trim() || !title.trim()) { setMessage('请填写文章标题和正文。'); return }
    let saved: Draft | undefined
    await run('正在保存文章…', async () => {
      const result = await window.discoveryApi.save({ id: selected.id, title: title.trim(), content: candidate, ...(imageCandidate ? { imageToken: imageCandidate.token } : {}) })
      if (!result.ok) { setMessage(result.error); return }
      if (result.value.warning) { setMessage(result.value.warning); return }
      saved = result.value.draft
    })
    if (saved) onSaved(saved)
  }
  return <section className="discovery-page" aria-labelledby="discovery-heading">
    <header className="discovery-heading">
      <h1 id="discovery-heading">内容发现</h1>
      <div className="discovery-session">
        {account.state === 'logged_in' ? <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" variant="outline" className="discovery-account-button" disabled={!!busy} aria-label={`小红书账号：${account.nickname || '已登录'}`}><span className="discovery-account-avatar"><UserRound aria-hidden="true"/></span><span className="discovery-account-name">{account.nickname || '已登录'}</span><ChevronDown aria-hidden="true"/></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void run('正在清除登录状态…', async () => { const result = await window.discoveryApi.logout(); if (result.ok) { accountRequest.current++; setAccount({ state: 'logged_out' }); setItems([]); setSelected(null); setCandidate(''); setImageCandidate(null); setRewrittenImage(null); setRewriteImageMessage(''); setSearched(false); setMessage('已退出小红书。') } else setMessage(result.error) })}><LogOut aria-hidden="true"/>退出登录</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu> : <Button type="button" variant="outline" className="discovery-login-button" disabled={!!busy} onClick={() => void run('正在打开登录窗口…', async () => { const result = await window.discoveryApi.login(); setMessage(result.ok ? '请在小红书窗口中登录，完成后返回。' : result.error) })}><LogIn aria-hidden="true"/>登录小红书</Button>}
      </div>
    </header>
    <form className="discovery-search" onSubmit={event => { event.preventDefault(); void search() }}><label className="sr-only" htmlFor="discovery-query">搜索主题</label><div><span className="discovery-search-field"><Search aria-hidden="true"/><Input id="discovery-query" value={query} maxLength={100} disabled={!!busy} onChange={event => setQuery(event.target.value)} placeholder="搜索小红书主题…"/></span><Button type="submit" disabled={!!busy || !query.trim()}>搜索</Button></div></form>
    {(busy || message) && <p className="discovery-feedback" role="status" aria-live="polite">{busy || message}</p>}
    <div className="discovery-columns">
      <section className="discovery-results" aria-label="搜索结果"><div className="discovery-section-head"><h2>搜索结果</h2><span>{searched ? `${items.length} 条` : ''}</span></div>{items.length ? <ul>{items.map(item => <li key={item.id}><button type="button" className="discovery-result" disabled={!!busy} aria-pressed={selected?.id === item.id} onClick={() => void select(item)}>{item.hasCover && <DiscoveryImage id={item.id} index={-1} alt="" className="discovery-cover"/>}<span className="discovery-result-text"><strong>{item.title}</strong><span>{item.author || '作者未提供'}{item.likes ? ` · 赞 ${item.likes}` : ''}</span></span></button></li>)}</ul> : <p className="discovery-empty">{searched ? '没有找到相关帖子' : '搜索后查看相关帖子'}</p>}</section>
      <section className="discovery-detail" aria-label="帖子详情">{selected ? <>
        <div className="discovery-section-head"><h2>帖子详情</h2><div className="discovery-detail-actions"><Button type="button" size="sm" variant="outline" disabled={!!busy || selected.imageCount === 0} onClick={() => void rewriteCurrentImage()}><ImagePlus aria-hidden="true"/>{busy === '正在参考帖子图片生成新图…' ? '正在改图…' : '一键改图'}</Button><Button type="button" size="sm" disabled={!!busy} onClick={() => void rewrite()}><Sparkles aria-hidden="true"/>一键改写</Button><Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => void exportPost()}><Download aria-hidden="true"/>{busy === '正在保存帖子内容和图片…' ? '保存中…' : '保存图文'}</Button><Button type="button" size="icon-sm" variant="ghost" aria-label="打开原文" title="打开原文" disabled={!!busy} onClick={() => void run('正在打开原文…', async () => { const result = await window.discoveryApi.openOriginal(selected.id); if (!result.ok) setMessage(result.error) })}><ExternalLink aria-hidden="true"/></Button></div></div>
        {exportMessage && <p className="discovery-export-feedback" role="status" aria-live="polite">{exportMessage}</p>}
        <div className="discovery-detail-body">
          <section className="discovery-gallery" aria-label="帖子图片"><div className="discovery-gallery-heading"><h3>图片 <span>{selected.imageCount}</span></h3>{selected.imageCount > 0 && <span>已选第 {imageIndex + 1} 张</span>}</div>
            {selected.imageCount > 0 ? <><div className="discovery-image-creation"><p className="discovery-hint">改图会将所选图片发送给模型。</p>{rewriteImageMessage && <p className="discovery-image-error" role="status" aria-live="polite">{rewriteImageMessage}</p>}{rewrittenImage && <div className="discovery-image-preview"><p>改图候选 · 参考第 {rewrittenImage.index + 1} 张</p><img src={rewrittenImage.dataUrl} alt="改图候选"/><div className="discovery-image-preview-actions"><Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => void downloadCurrentImage()}><Download aria-hidden="true"/>保存图片</Button><Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={() => setRewrittenImage(null)}>放弃</Button></div></div>}</div><div className="discovery-image-grid">{Array.from({ length: selected.imageCount }, (_, index) => <button type="button" className="discovery-image-choice" key={`${selected.id}-${index}`} aria-label={`选择第 ${index + 1} 张图片作为参考`} aria-pressed={imageIndex === index} disabled={!!busy} onClick={() => setImageIndex(index)}><DiscoveryImage id={selected.id} index={index} alt={`帖子图片 ${index + 1}`} className="discovery-gallery-image"/><span className="discovery-image-number">{index + 1}</span></button>)}</div></> : <p className="discovery-empty">暂无图片</p>}
          </section>
          <article className="discovery-content"><h3>{selected.title}</h3><p className="discovery-author">{selected.author || '小红书帖子'}</p><p className="discovery-hint">改写会将正文发送给模型。</p>
            {candidate && <section className="discovery-candidate" aria-labelledby="discovery-candidate-title"><h3 id="discovery-candidate-title">改写候选</h3><p className="discovery-hint">请核查内容后保存。</p><label htmlFor="discovery-title">文章标题</label><Input id="discovery-title" value={title} maxLength={100} disabled={!!busy} onChange={event => { setTitle(event.target.value); setImageCandidate(null) }}/><label htmlFor="discovery-candidate">候选正文</label><Textarea id="discovery-candidate" value={candidate} disabled={!!busy} onChange={event => { setCandidate(event.target.value); setImageCandidate(null) }}/>{selected.imageCount > 0 && <div className="discovery-image-creation"><p className="discovery-hint">将第 {imageIndex + 1} 张图片和改写文案发送给模型。</p><Button type="button" variant="outline" disabled={!!busy || !title.trim() || !candidate.trim()} onClick={() => void generateImage()}><ImagePlus aria-hidden="true"/>{busy.startsWith('正在识别参考图片') ? '正在生成新图…' : '参考图片生成配图'}</Button>{imageError && <p className="discovery-image-error" role="alert">{imageError}</p>}{imageCandidate && <div className="discovery-image-preview"><p>生成候选 · 参考第 {imageCandidate.index + 1} 张</p><img src={imageCandidate.dataUrl} alt="生成的新配图候选"/><Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={() => setImageCandidate(null)}>移除图片</Button></div>}</div>}<div className="discovery-candidate-actions"><Button type="button" variant="outline" disabled={!!busy} onClick={() => { setCandidate(''); setImageCandidate(null) }}>放弃</Button><Button type="button" disabled={!!busy} onClick={() => void save()}>保存为新文章</Button></div></section>}
            <div className="discovery-original">{selected.content}</div>
          </article>
        </div>
      </> : <p className="discovery-empty discovery-detail-empty">选择帖子查看详情</p>}</section>
    </div>
  </section>
}
