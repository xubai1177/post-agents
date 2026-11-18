import { useEffect, useState } from 'react'
import type { Draft, Platform } from '../../../shared/drafts'
import type { DraftImage } from '../../../shared/images'
import type { OpenDocument } from './types'

export function ImageGallery({ draft, platform, document, busy, onBusy }: { draft: Draft; platform: Platform; document: OpenDocument; busy: boolean; onBusy: (busy: boolean) => void }) {
  const [images, setImages] = useState<DraftImage[]>([])
  const [selected, setSelected] = useState<DraftImage | null>(null)
  const [count, setCount] = useState(2)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    async function load() {
      try { const result = await window.imagesApi.list(draft.id, platform); if (!active) return; if (result.ok) setImages(result.value); else setMessage(result.error) }
      catch { if (active) setMessage('无法读取配图。') } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [draft.id, platform])
  useEffect(() => {
    if (!selected) return
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [selected])
  async function generate() {
    if (document.content !== document.savedContent) { setMessage('请先保存当前平台的文案，再生成配图。'); return }
    onBusy(true); setMessage('正在策划并生成图片，请稍候…')
    try {
      const result = await window.imagesApi.generate({ id: draft.id, platform, version: document.version, count })
      if (!result.ok) { setMessage(result.error); return }
      setImages((current) => [...current, ...result.value.images])
      const failed = result.value.failures.map((item) => `第 ${item.index} 张：${item.error}`).join('；')
      setMessage(failed ? `已保存 ${result.value.images.length} 张；${failed}` : `已保存 ${result.value.images.length} 张图片，请逐张检查文字、事实和画面。`)
    } catch { setMessage('生成配图失败，请检查图片服务。') } finally { onBusy(false) }
  }
  return <section className="image-gallery" aria-label={`${platform}配图`}><div className="gallery-heading"><div><h2>封面与配图</h2><p>按当前平台文案生成，图片仅保存在本地。</p></div><div className="gallery-actions"><label>图片数量 <select aria-label="图片数量" value={count} disabled={busy} onChange={(event) => setCount(Number(event.target.value))}>{[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} 张</option>)}</select></label><button className="primary-button" type="button" disabled={busy || loading} onClick={() => void generate()}>{busy ? '处理中…' : '生成配图'}</button></div></div>{message && <p className="gallery-message" role="status">{message}</p>}{loading ? <p className="gallery-empty">正在读取配图…</p> : images.length ? <div className="image-grid">{images.map((image) => <button type="button" className="image-card" key={image.name} onClick={() => setSelected(image)} aria-label={`预览 ${image.name}`}><img src={image.dataUrl} alt=""/><span>{image.name}</span></button>)}</div> : <p className="gallery-empty">还没有配图。生成后请检查图片文字、事实和画面。</p>}{selected && <div className="image-modal" role="dialog" aria-modal="true" aria-label={`图片预览：${selected.name}`}><button type="button" className="image-modal-close" autoFocus onClick={() => setSelected(null)} aria-label="关闭图片预览">×</button><img src={selected.dataUrl} alt={selected.name}/><span>{selected.name}</span></div>}</section>
}
