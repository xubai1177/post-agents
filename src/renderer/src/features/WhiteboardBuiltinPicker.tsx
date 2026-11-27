import { useEffect, useState } from 'react'
import { ArrowLeft, Heart, ImagePlus, Search } from 'lucide-react'
import type { CanvasAsset } from '../../../shared/whiteboard'
import { builtinAssets, materialShapes, type BuiltinAsset } from './whiteboard-builtin'
import './whiteboard-builtin.css'

type View = '首页' | '最近使用' | '收藏夹' | '贴纸' | '形状' | '文字素材' | '容器' | '箭头' | '边框' | '圈勾叉' | '图片' | '背景' | '我的素材'
type Basic = 'line' | 'arrow' | 'rect' | 'circle'
type Entry = { id: string; name: string; group: View; kind: 'vector'; asset: BuiltinAsset } | { id: string; name: string; group: View; kind: 'basic'; basic: Basic } | { id: string; name: string; group: View; kind: 'text'; color: string } | { id: string; name: string; group: View; kind: 'image'; asset: CanvasAsset }
const basics: Entry[] = [
  { id: 'basic-rect', name: '矩形', group: '形状', kind: 'basic', basic: 'rect' },
  { id: 'basic-circle', name: '圆形', group: '形状', kind: 'basic', basic: 'circle' },
  { id: 'basic-line', name: '直线', group: '箭头', kind: 'basic', basic: 'line' },
  { id: 'basic-arrow', name: '箭头', group: '箭头', kind: 'basic', basic: 'arrow' }
]
const decorations: Entry[] = [
  { id: 'text-idea', name: '灵感时刻', group: '文字素材', kind: 'text', color: '#d18442' },
  { id: 'text-focus', name: '重点笔记', group: '文字素材', kind: 'text', color: '#5968d9' },
  { id: 'text-start', name: '现在开始', group: '文字素材', kind: 'text', color: '#408c73' }
]
const groups: View[] = ['形状', '容器', '箭头', '边框', '圈勾叉']
const sections: View[] = ['最近使用', '收藏夹', '贴纸', '形状', '文字素材']

export function WhiteboardBuiltinPicker({ panel, disabled, assets, background, onBackground, onAdd, onBasic, onText, onAsset, onImport }: {
  panel: 'materials' | 'image' | 'background' | 'mine'
  disabled: boolean; assets: CanvasAsset[]; background: string; onBackground: (color: string) => void
  onAdd: (id: string) => void; onBasic: (kind: Basic) => void; onText: (text: string, color: string) => void
  onAsset: (asset: CanvasAsset, original?: boolean) => void; onImport: () => void
}) {
  const [view, setView] = useState<View>('首页')
  const [query, setQuery] = useState('')
  useEffect(() => { setQuery('') }, [panel])
  const [recent, setRecent] = useState<string[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const entries: Entry[] = [
    ...basics,
    ...materialShapes.map(asset => ({ id: asset.id, name: asset.name, group: asset.category as View, kind: 'vector' as const, asset })),
    ...builtinAssets.map(asset => ({ id: asset.id, name: asset.name, group: '贴纸' as const, kind: 'vector' as const, asset })),
    ...decorations,
    ...assets.map((asset, index) => ({ id: `image-${index}`, name: asset.name, group: '我的素材' as const, kind: 'image' as const, asset }))
  ]
  function matches(entry: Entry): boolean { return `${entry.name} ${entry.group} ${entry.kind === 'vector' ? entry.asset.category : ''}`.toLowerCase().includes(query.trim().toLowerCase()) }
  function list(group: View): Entry[] {
    if (group === '最近使用') return recent.flatMap(id => entries.find(item => item.id === id) ?? []).filter(matches)
    if (group === '收藏夹') return favorites.flatMap(id => entries.find(item => item.id === id) ?? []).filter(matches)
    if (group === '图片') return entries.filter(item => item.kind === 'image' && matches(item))
    return entries.filter(item => item.group === group && matches(item))
  }
  function add(entry: Entry): void {
    if (entry.kind === 'vector') onAdd(entry.id)
    else if (entry.kind === 'basic') onBasic(entry.basic)
    else if (entry.kind === 'text') onText(entry.name, entry.color)
    else onAsset(entry.asset)
    setRecent(old => [entry.id, ...old.filter(id => id !== entry.id)].slice(0, 20))
  }
  function cards(items: Entry[]) {
    return <div className="wb-material-grid">{items.map(item => <div className="wb-material-card" key={item.id}>
      <button type="button" className="wb-material-add" disabled={disabled} onClick={() => add(item)} aria-label={`添加${item.name}`} title={item.kind === 'vector' || item.kind === 'basic' ? '路径素材 · 支持描线' : item.kind === 'image' ? '图片素材 · 擦出' : '可编辑文字素材'}>
        <span className="wb-material-art">{item.kind === 'vector' ? <svg viewBox="0 0 128 128" aria-hidden="true">{item.asset.paths.map((path, index) => <path key={index} d={path.d} fill={path.fill} stroke={path.stroke === false ? 'none' : '#333940'} strokeWidth={item.asset.strokeWidth ?? 4} strokeLinecap="round" strokeLinejoin="round"/>)}</svg> : item.kind === 'image' ? <img src={item.asset.image} width={90} height={76} alt=""/> : item.kind === 'text' ? <span className="wb-material-text-art" style={{ color: item.color }}>{item.name}</span> : <svg viewBox="0 0 100 80" aria-hidden="true" fill="none" stroke="#333940" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">{item.basic === 'rect' ? <rect x="15" y="12" width="70" height="56" rx="2"/> : item.basic === 'circle' ? <ellipse cx="50" cy="40" rx="35" ry="28"/> : <path d={item.basic === 'arrow' ? 'M12 40 H87 M70 25 L87 40 L70 55' : 'M12 40 H88'}/>}</svg>}</span><span className="wb-material-name">{item.name}</span>
      </button>
      <button type="button" className="wb-material-favorite" aria-label={`${favorites.includes(item.id) ? '取消收藏' : '收藏'}${item.name}`} aria-pressed={favorites.includes(item.id)} onClick={() => setFavorites(old => old.includes(item.id) ? old.filter(id => id !== item.id) : [...old, item.id])}><Heart aria-hidden="true" fill={favorites.includes(item.id) ? 'currentColor' : 'none'}/></button>
      {item.kind === 'image' && item.asset.backgroundRemoved && <button type="button" className="wb-material-original" disabled={disabled} onClick={() => onAsset(item.asset, true)}>添加原图</button>}
    </div>)}</div>
  }
  function section(group: View, limited = false) {
    const items = list(group)
    return <section className="wb-material-section" key={group}><div className="wb-material-heading"><h3>{group}</h3>{limited && <button type="button" onClick={() => setView(group)}>查看全部</button>}</div>{items.length ? cards(limited ? items.slice(0, 4) : items) : <p className="wb-canvas-empty">{query ? '没有找到匹配的素材。' : group === '最近使用' ? '使用素材后会显示在这里。' : group === '收藏夹' ? '点击素材上的爱心即可收藏。' : '暂无素材。'}</p>}</section>
  }
  const visibleView: View = panel === 'materials' ? view : panel === 'image' ? '图片' : panel === 'background' ? '背景' : '我的素材'
  return <div className="wb-material-library">
    {visibleView !== '背景' && <>
    <label className="wb-material-search"><Search aria-hidden="true"/><span className="sr-only">搜索素材</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索素材…"/></label>
    </>}
    {panel === 'materials' && <div className="wb-material-shortcuts" aria-label="常用分类">{groups.map(group => <button type="button" key={group} aria-pressed={view === group} onClick={() => setView(group)}>{group}</button>)}</div>}
    {panel === 'materials' && view !== '首页' && <button type="button" className="wb-material-back" onClick={() => setView('首页')}><ArrowLeft aria-hidden="true"/>素材首页</button>}
    {visibleView === '首页' ? sections.map(group => section(group, true)) : visibleView === '背景' ? <section className="wb-material-section"><div className="wb-material-heading"><h3>画布底色</h3></div><div className="wb-material-backgrounds">{[['#ffffff', '白色'], ['#fff9eb', '暖白'], ['#f1f7f4', '浅绿'], ['#f0f4fa', '浅蓝']].map(([color, name]) => <button key={color} type="button" style={{ backgroundColor: color }} disabled={disabled} aria-label={name} aria-pressed={background === color} onClick={() => onBackground(color)}/>)}</div></section> : <>{(visibleView === '图片' || visibleView === '我的素材') && <><button type="button" className="wb-material-upload" disabled={disabled} onClick={onImport}><ImagePlus aria-hidden="true"/>上传本地图片</button><p className="wb-canvas-empty">上传和生成的素材仅在本次会话保留。</p></>}{section(visibleView)}</>}
  </div>
}
