import { useEffect, useState } from 'react'
import type { CanvasAsset, LocalBackgroundGroup, LocalBackgroundItem } from '../../../shared/whiteboard'

export function WhiteboardLocalBackgrounds({ disabled, onSelect, query }: { disabled: boolean; onSelect: (asset: CanvasAsset) => void; query: string }) {
  const [items, setItems] = useState<LocalBackgroundItem[]>([])
  const [status, setStatus] = useState('正在读取本地背景…')
  const [selected, setSelected] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<LocalBackgroundGroup | null>(null)
  useEffect(() => {
    let active = true
    void window.canvasApi.listLocalBackgrounds().then(result => {
      if (!active) return
      if (!result.ok) { setStatus(result.error); return }
      setItems(result.value); setStatus(result.value.length ? '' : '暂无本地背景图片。')
    }).catch(() => { if (active) setStatus('读取本地背景失败，请重新打开画布重试。') })
    return () => { active = false }
  }, [])
  async function select(item: LocalBackgroundItem) {
    setSelected(item.filename); setStatus('正在加载背景…')
    try {
      const result = await window.canvasApi.readLocalBackground(item.group, item.filename)
      if (!result.ok) { setStatus(result.error); return }
      onSelect({ ...result.value, name: item.name }); setStatus('')
    } catch { setStatus('背景加载失败，请重试。') } finally { setSelected(null) }
  }
  return <section className="wb-local-backgrounds" aria-label="本地背景分组">
    {status && <p className="wb-canvas-hint" role="status">{status}</p>}
    {(['可爱手帐', '木质纹理'] as LocalBackgroundGroup[]).map(group => {
      const backgrounds = items.filter(item => item.group === group && `${item.name} ${item.group}`.includes(query.trim()))
      const shown = expanded === group ? backgrounds : backgrounds.slice(0, 4)
      return backgrounds.length > 0 && <div className="wb-bg-category" key={group}><div className="wb-bg-category-heading"><h3>{group}</h3>{backgrounds.length > 4 && <button type="button" onClick={() => setExpanded(expanded === group ? null : group)}>{expanded === group ? '收起' : '查看更多'}</button>}</div><div className="wb-bg-asset-list">{shown.map(item => <button key={item.filename} type="button" disabled={disabled || selected !== null} onClick={() => void select(item)} aria-label={`将${item.name}设为背景`}><img src={item.thumbnail} alt="" width={72} height={72} loading="lazy"/><span>{item.name}</span></button>)}</div></div>
    })}
  </section>
}
