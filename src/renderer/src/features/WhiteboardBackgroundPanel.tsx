import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import type { CanvasAsset, CanvasImageUsage } from '../../../shared/whiteboard'
import type { CanvasBackground } from './whiteboard-background'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'
import { WhiteboardLocalBackgrounds } from './WhiteboardLocalBackgrounds'

const presets = [{ id: 'paper', name: '暖色纸张' }, { id: 'grid', name: '浅色网格' }, { id: 'dots', name: '浅色圆点' }] as const
const colors = [['#ffffff','白色'],['#25282e','黑色'],['#d7d8da','浅灰'],['#e07868','珊瑚红'],['#c96786','玫红'],['#9171b8','紫色'],['#657ac5','靛蓝'],['#6f9ddf','蓝色'],['#7ab9d0','浅蓝'],['#72a99c','青绿'],['#8bb17b','绿色'],['#b2c888','浅绿'],['#f4df83','浅黄'],['#eec377','金黄'],['#eaa078','橙色'],['#ac9580','棕色'],['#fff9eb','暖白'],['#f1f7f4','淡绿'],['#f0f4fa','淡蓝'],['#f5ecf2','淡粉']] as const

export function WhiteboardBackgroundPanel({ background, disabled, onChange, onSelect, onPreset }: {
  background: CanvasBackground; disabled: boolean; onChange: (patch: Partial<CanvasBackground>) => void
  onSelect: (asset: CanvasAsset) => void; onPreset: (kind: 'paper' | 'grid' | 'dots') => void
}) {
  const [query, setQuery] = useState('')
  const visible = presets.filter(item => item.name.includes(query.trim()))
  return <div className="wb-bg-library">
    <label className="wb-material-search"><Search aria-hidden="true"/><span className="sr-only">搜索背景</span><input type="search" placeholder="搜索背景…" value={query} onChange={event => setQuery(event.target.value)}/></label>
    <div className="wb-bg-palette" aria-label="画布底色">{colors.map(([color,name]) => <button key={color} type="button" disabled={disabled} style={{ backgroundColor: color }} aria-label={name} aria-pressed={background.color === color} onClick={() => onChange({ color })}/>)}<label className="wb-bg-color" title="自定义颜色"><span className="sr-only">自定义背景颜色</span><input type="color" value={background.color} disabled={disabled} onChange={event => onChange({ color: event.target.value })}/></label></div>
    {visible.length > 0 && <section className="wb-bg-category"><h3>基础纹理</h3><div className="wb-bg-library-grid">{visible.map(item => <button key={item.id} type="button" className={`wb-bg-preset ${item.id}`} disabled={disabled} aria-pressed={background.name === item.name && background.mode === 'tile'} onClick={() => onPreset(item.id)}><span>{item.name}</span></button>)}</div></section>}
    <WhiteboardLocalBackgrounds disabled={disabled} onSelect={onSelect} query={query}/>
  </div>
}

export function WhiteboardBackgroundProperties({ background, assets, disabled, candidate, usage, loading, adjusting, onAdjusting, onChange, onSelect, onImport, onGenerate }: {
  background: CanvasBackground; assets: CanvasAsset[]; disabled: boolean; candidate: CanvasAsset | null
  usage: { model: string; status: string; usage: CanvasImageUsage | null }[]; loading: boolean; adjusting: boolean
  onAdjusting: (value: boolean) => void; onChange: (patch: Partial<CanvasBackground>) => void
  onSelect: (asset: CanvasAsset) => void; onImport: () => void; onGenerate: (prompt: string) => void
}) {
  const [prompt, setPrompt] = useState(''), [showAssets, setShowAssets] = useState(false), [showAI, setShowAI] = useState(false), [showSettings, setShowSettings] = useState(false)
  useEffect(() => { setShowSettings(false); onAdjusting(false) }, [background.image, onAdjusting])
  return <div className="wb-bg-properties">
    <h2>背景属性</h2><p className="wb-canvas-panel-sub">调整当前画布背景</p>
    {background.image ? <section><h3>当前背景</h3><div className="wb-bg-current"><img src={background.image} width={80} height={60} alt="当前背景"/><span>{background.name}</span></div><div className="wb-bg-actions"><Button size="sm" variant="outline" disabled={disabled} onClick={onImport}>更换</Button><Button size="sm" variant="outline" disabled={disabled} aria-expanded={showSettings} aria-controls="wb-bg-settings" onClick={() => { const open = !showSettings; setShowSettings(open); onAdjusting(open && background.mode === 'cover') }}>{showSettings ? '完成调整' : '调整'}</Button><Button size="sm" variant="outline" disabled={disabled} onClick={() => { onAdjusting(false); onChange({ image: null, name: '' }) }}>移除</Button></div>
    {showSettings && <div id="wb-bg-settings"><div className="wb-bg-actions"><Button size="sm" variant={background.mode === 'cover' ? 'default' : 'outline'} disabled={disabled} onClick={() => { onChange({ mode: 'cover', scale: 1 }); onAdjusting(true) }} aria-pressed={background.mode === 'cover'}>铺满</Button><Button size="sm" variant={background.mode === 'tile' ? 'default' : 'outline'} disabled={disabled} onClick={() => { onAdjusting(false); onChange({ mode: 'tile', scale: 1 }) }} aria-pressed={background.mode === 'tile'}>平铺</Button></div><label htmlFor="wb-bg-scale">{background.mode === 'cover' ? '图片缩放' : '纹理大小'} {Math.round(background.scale * 100)}%</label><input id="wb-bg-scale" type="range" min={background.mode === 'cover' ? 1 : .25} max={3} step="0.05" value={background.scale} disabled={disabled} onChange={event => onChange({ scale: Number(event.target.value) })}/>{background.mode === 'cover' && adjusting && <><p className="wb-canvas-hint">在画布上拖动背景，或使用滑块调整。</p>{(['x','y'] as const).map(axis => <label key={axis}>{axis === 'x' ? '水平位置' : '垂直位置'}<input type="range" min="0" max="1" step="0.01" value={background[axis]} disabled={disabled} onChange={event => onChange({ [axis]: Number(event.target.value) })}/></label>)}</>}{background.mode === 'tile' && <p className="wb-canvas-hint">图片边缘不连续时，平铺可能出现接缝。</p>}</div>}</section> : <p className="wb-canvas-hint">从左侧选择颜色或背景图。</p>}
    <section><h3>添加背景图片</h3><div className="wb-bg-actions"><Button size="sm" variant="outline" disabled={disabled} onClick={onImport}>上传背景图</Button><Button size="sm" variant="outline" disabled={disabled} onClick={() => setShowAssets(!showAssets)} aria-expanded={showAssets}>我的素材</Button><Button size="sm" variant="outline" disabled={disabled} onClick={() => setShowAI(!showAI)} aria-expanded={showAI}>AI 生成背景</Button></div>
    {showAssets && <div className="wb-bg-asset-list">{assets.length ? assets.map((asset, index) => <button type="button" key={index} disabled={disabled} onClick={() => onSelect(asset)}><img src={asset.original} alt="" width={72} height={55}/><span>{asset.name}</span></button>) : <p className="wb-canvas-hint">上传或生成图片后，可在这里选择。</p>}</div>}
    {showAI && <div className="wb-bg-ai"><label htmlFor="wb-bg-prompt">描述背景</label><Textarea id="wb-bg-prompt" rows={3} maxLength={300} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="例如：浅色纸张和淡淡的植物轮廓…"/><p className="wb-canvas-hint">使用当前图片模型，可能产生费用。生成后可预览并选择应用。</p><Button size="sm" disabled={disabled || !prompt.trim()} onClick={() => onGenerate(prompt)}>{loading ? '正在生成…' : '生成背景'}</Button>{candidate && <div className="wb-bg-candidate"><img src={candidate.original} width={180} height={100} alt={`生成的背景：${candidate.name}`}/><Button size="sm" variant="outline" disabled={disabled} onClick={() => onSelect(candidate)}>设为背景</Button></div>}{usage.length > 0 && <details><summary>背景图片模型用量</summary>{usage.map((u,i) => <p key={i}>{u.model} · {u.status}<br/>输入 {u.usage?.inputTokens ?? '未提供'} / 输出 {u.usage?.outputTokens ?? '未提供'} / 合计 {u.usage?.totalTokens ?? '未提供'}</p>)}</details>}</div>}</section>
  </div>
}
