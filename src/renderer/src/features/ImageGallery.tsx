import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Icon } from '../components/Icon'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useMessage } from '@/components/MessageProvider'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useEffect, useRef, useState } from 'react'
import type { Draft, Platform } from '../../../shared/drafts'
import type { ImageStyle } from '../../../shared/image-styles'
import type { DraftImage, ImageDownloadRequest, ImageJob } from '../../../shared/images'
import type { OpenDocument } from './types'
import { ImageStylePicker } from './ImageStylePicker'

export function ImageGallery({ draft, platform, document, busy, imageStyle, onStyleSave }: { draft: Draft; platform: Platform; document: OpenDocument; busy: boolean; imageStyle: ImageStyle; onStyleSave: (style: ImageStyle) => Promise<string | null> }) {
  const [images, setImages] = useState<DraftImage[]>([])
  const [selected, setSelected] = useState<DraftImage | null>(null)
  const [style, setStyle] = useState<ImageStyle>(imageStyle)
  const [styleDialogOpen, setStyleDialogOpen] = useState(false)
  const [dialogMessage, setDialogMessage] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [job, setJob] = useState<ImageJob | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const { confirm, confirmation } = useConfirmDialog()
  const showMessage = useMessage()
  const selectedTrigger = useRef<HTMLButtonElement | null>(null)
  const generating = useRef(false)
  const downloadPending = useRef(false)
  const removePending = useRef(false)
  useEffect(() => { setStyle(imageStyle) }, [imageStyle])
  useEffect(() => {
    let active = true
    let sequence = 0
    async function load() {
      const current = ++sequence
      try {
        const [imageResult, jobsResult] = await Promise.all([window.imagesApi.list(draft.id, platform), window.imagesApi.jobs()])
        if (!active || current !== sequence) return
        if (imageResult.ok) setImages(imageResult.value); else setMessage(imageResult.error)
        if (jobsResult.ok) {
          const next = jobsResult.value.find(item => item.id === draft.id && item.platform === platform) ?? null
          setJob(next)
          if (next?.message) setMessage(next.message.includes('文案已变化，请重新读取并生成。') ? '' : next.message)
        } else setMessage(jobsResult.error)
      } catch { if (active && current === sequence) setMessage('无法读取配图状态。') }
      finally { if (active && current === sequence) setLoading(false) }
    }
    const unsubscribe = window.imagesApi.onJobsChanged(() => { void load() })
    void load()
    return () => { active = false; unsubscribe() }
  }, [draft.id, platform])
  async function generate() {
    if (generating.current) return
    if (document.content !== document.savedContent) { setDialogMessage('文案正在自动保存，请稍后重试；如果保存失败，请先处理页面提示。'); return }
    generating.current = true; setSubmitting(true); setDialogMessage(''); setMessage('')
    try {
      const styleError = await onStyleSave(style)
      if (styleError) { setDialogMessage(styleError); return }
      const result = await window.imagesApi.enqueue({ id: draft.id, platform, version: document.version, style })
      if (!result.ok) { setDialogMessage(result.error); return }
      setStyleDialogOpen(false)
      const jobs = await window.imagesApi.jobs()
      if (jobs.ok) setJob(jobs.value.find(item => item.id === draft.id && item.platform === platform) ?? null)
    } catch { setDialogMessage('加入配图队列失败，请重试。') } finally { generating.current = false; setSubmitting(false) }
  }
  const imageBusy = job?.status === 'queued' || job?.status === 'running'
  const selectedIndex = selected ? images.findIndex(image => image.name === selected.name) : -1
  function selectAdjacentImage(offset: number) {
    if (selectedIndex < 0) return
    const next = images[selectedIndex + offset]
    if (next) setSelected(next)
  }
  async function download(image?: DraftImage) {
    if (downloadPending.current) return
    downloadPending.current = true
    setDownloading(true)
    const request: ImageDownloadRequest = image
      ? { id: draft.id, platform, kind: 'single', name: image.name }
      : { id: draft.id, platform, kind: 'all' }
    try {
      if (typeof window.imagesApi?.download !== 'function') {
        showMessage('当前应用版本未加载下载功能，请完全退出应用后重新启动。', true)
        return
      }
      const result = await window.imagesApi.download(request)
      if (!result.ok) {
        showMessage(result.error, true)
      } else if (result.value) {
        const { saved, failed } = result.value
        if (failed) showMessage(`已下载 ${saved} 张，${failed} 张失败，请检查源图片和保存位置。`, true)
        else showMessage(image ? '图片已下载。' : `已下载 ${saved} 张配图。`)
      }
    } catch (error) {
      console.error('下载图片失败', error)
      const details = error instanceof Error ? error.message : ''
      showMessage(/No handler registered|could not be cloned/i.test(details)
        ? '下载服务未更新，请完全退出应用后重新启动。'
        : '无法连接下载服务，请完全退出应用后重新启动。', true)
    } finally {
      downloadPending.current = false
      setDownloading(false)
    }
  }
  async function remove(image: DraftImage) {
    if (removePending.current) return
    removePending.current = true
    try {
      if (!await confirm({ title: '删除配图', message: '图片将移到系统废纸篓或回收站。', action: '删除' })) return
      setRemoving(true)
      const result = await window.imagesApi.remove(draft.id, platform, image.name)
      if (!result.ok) { showMessage(result.error, true); return }
      setImages(current => current.filter(item => item.name !== image.name))
      setSelected(current => current?.name === image.name ? null : current)
      showMessage('图片已删除。')
    } catch { showMessage('删除失败，请检查图片和工作空间。', true) }
    finally { removePending.current = false; setRemoving(false) }
  }
  return <Dialog open={styleDialogOpen} onOpenChange={open => {
    if (generating.current) return
    if (open) { setStyle(imageStyle); setDialogMessage('') }
    setStyleDialogOpen(open)
  }}>
    <Card asChild><section className="image-gallery" aria-label={`${platform}配图`}>
      <div className="gallery-heading">
        <h2>封面与配图</h2>
        <div className="gallery-actions">
          {images.length > 0 && <Button variant="ghost" size="icon-sm" className="gallery-download-all" disabled={downloading} aria-label="下载全部配图" title="下载全部配图" onClick={() => void download()}><Icon name="download" size={15}/></Button>}
          <DialogTrigger asChild><Button variant="ghost" size="icon-sm" className="gallery-generate" disabled={busy || loading || imageBusy} aria-busy={imageBusy} aria-label={imageBusy ? (job?.status === 'queued' ? '配图排队中' : '配图生成中') : '生成配图'} title={imageBusy ? (job?.status === 'queued' ? '配图排队中' : '配图生成中') : '生成配图'}><Icon name={imageBusy && job?.status !== 'queued' ? 'loading' : 'spark'} size={15} className={imageBusy && job?.status !== 'queued' ? 'animate-spin motion-reduce:animate-none' : undefined}/></Button></DialogTrigger>
        </div>
      </div>
      {imageBusy && <div className="mb-3" role="status" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{job?.status === 'queued' ? '等待生成' : job?.progress?.phase === 'generating' ? `正在生成第 ${job.progress.current} / ${job.progress.total} 张` : '正在策划配图'}</span>
          {job?.progress?.phase === 'generating' && <span>已处理 {job.progress.completed} 张</span>}
        </div>
        {job?.progress?.phase === 'generating' && <progress className="mt-2 h-1 w-full accent-primary" value={job.progress.completed} max={job.progress.total} aria-label="配图生成进度"/>}
      </div>}
      {message && <p className="gallery-message" role="status">{message}</p>}
      {loading ? <p className="gallery-empty" role="status">正在读取配图…</p> : images.length ? <div className="image-grid">
        {images.map(image => <div className="gallery-image-tile relative min-w-0" key={image.name}>
          <Button variant="outline" className="image-card w-full"
            onClick={event => { selectedTrigger.current = event.currentTarget; setSelected(image) }} aria-label={`预览 ${image.name}`}>
            <img src={image.dataUrl} alt=""/><span>{image.name}</span>
          </Button>
          <Button variant="ghost" size="icon-sm" className="gallery-image-download" disabled={downloading}
            aria-label={`下载 ${image.name}`} title="下载图片" onClick={() => void download(image)}><Icon name="download" size={15}/></Button>
          <Button variant="ghost" size="icon-sm" className="gallery-image-delete" disabled={removing}
            aria-label={`删除 ${image.name}`} title="删除图片" onClick={() => void remove(image)}><Icon name="trash" size={15}/></Button>
        </div>)}
      </div> : <p className="gallery-empty">还没有配图。</p>}
      <DialogContent className="style-dialog max-w-none sm:max-w-none" showCloseButton={false}
        onEscapeKeyDown={event => { if (generating.current) event.preventDefault() }}
        onInteractOutside={event => event.preventDefault()}>
        <div className="style-dialog-content">
          <div className="style-dialog-header">
            <div><DialogTitle>生成配图</DialogTitle><DialogDescription>选择图片风格，为当前平台文案生成封面和配图。</DialogDescription></div>
            <Button variant="ghost" size="icon-sm" aria-label="关闭" disabled={submitting}
              onClick={() => setStyleDialogOpen(false)}><Icon name="close"/></Button>
          </div>
          <ImageStylePicker value={style} onChange={setStyle} disabled={submitting}/>
          {dialogMessage && <p role="status">{dialogMessage}</p>}
          <div className="style-dialog-actions">
            <Button variant="outline" disabled={submitting} onClick={() => setStyleDialogOpen(false)}>取消</Button>
            <Button disabled={submitting} onClick={() => void generate()}>{submitting ? '提交中…' : '生成配图'}</Button>
          </div>
        </div>
      </DialogContent>
      <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null) }}>
        <DialogContent className="article-image-preview max-w-none sm:max-w-none" showCloseButton={false} aria-describedby={undefined}
          onCloseAutoFocus={event => { event.preventDefault(); selectedTrigger.current?.focus() }}
          onKeyDown={event => {
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault()
              selectAdjacentImage(event.key === 'ArrowLeft' ? -1 : 1)
            }
          }}>
          {selected && <>
            <div className="article-preview-heading"><div className="article-preview-title"><span className="article-preview-title-icon"><Icon name="image" size={17}/></span><DialogTitle>图片预览</DialogTitle></div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={downloading} onClick={() => void download(selected)}><Icon name="download"/>下载图片</Button>
                <Button variant="ghost" size="icon-sm" aria-label="关闭图片预览" onClick={() => setSelected(null)}><Icon name="close" size={18}/></Button>
              </div>
            </div>
            <div className="article-preview-stage"><img src={selected.dataUrl} alt={selected.name}/></div>
            <div className="article-preview-footer">
              <div className="article-preview-info" aria-live="polite"><small>文件名称</small><span title={selected.name}>{selected.name}</span></div>
              <div className="article-preview-navigation" aria-label="图片切换">
                <Button variant="ghost" size="sm" disabled={selectedIndex <= 0} onClick={() => selectAdjacentImage(-1)}><Icon name="back" size={15}/>上一张</Button>
                <span className="article-preview-counter" aria-live="polite">{selectedIndex >= 0 ? `${selectedIndex + 1} / ${images.length}` : '—'}</span>
                <Button variant="ghost" size="sm" disabled={selectedIndex < 0 || selectedIndex >= images.length - 1} onClick={() => selectAdjacentImage(1)}>下一张<Icon name="arrow" size={15}/></Button>
              </div>
            </div>
          </>}
        </DialogContent>
      </Dialog>
      {confirmation}
    </section></Card>
  </Dialog>
}

