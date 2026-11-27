import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, Copy, ArrowLeft, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Pause, Play, RotateCcw, Trash2, Type, Sparkles, Undo2, Redo2, Shapes, Image as ImageIcon, Palette, FolderHeart } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { Button } from '../components/ui/button'
import { useMessage } from '../components/MessageProvider'
import { Textarea } from '../components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import type { CanvasProjectData, CanvasProjectSummary } from '../../../shared/canvas-project'
import type { CanvasAsset, CanvasImageUsage } from '../../../shared/whiteboard'
import './whiteboard-canvas.css'
import { CanvasVoicePanel } from './CanvasVoicePanel'
import { WhiteboardBuiltinPicker } from './WhiteboardBuiltinPicker'
import { WhiteboardBackgroundPanel, WhiteboardBackgroundProperties } from './WhiteboardBackgroundPanel'
import { defaultBackground, drawBackground, coverRect, createBackgroundTile, type CanvasBackground } from './whiteboard-background'
import { drawBuiltin, findBuiltin } from './whiteboard-builtin-draw'
import { canvasTimeline, moveCanvasDrawOrder, moveCanvasLayer, penTravelProgress } from './whiteboard-canvas-timeline'
import { canvasProjectListError } from './canvas-project-errors'
import { canvasProjectFromRoute, canvasProjectRoute } from './canvas-routes'

type Kind = 'text' | 'line' | 'arrow' | 'rect' | 'circle' | 'image' | 'vector'
type Pen = 'pencil' | 'marker' | 'fountain' | 'none'
interface Item { id: string; kind: Kind; x: number; y: number; w: number; h: number; color: string; lineWidth: number; size: number; text: string; image?: string; builtinId?: string; duration: number; drawOrder?: number; wait?: number; decoration?: string }
interface CanvasPanel { id: string; name: string; items: Item[]; background: CanvasBackground; narration: string; holdSeconds: number; ratio: 'landscape' | 'vertical'; history: CanvasHistory[]; future: CanvasHistory[] }
type CanvasHistory = { items: Item[]; background: CanvasBackground }
interface Generated { name: string; model: string; status: string; usage: CanvasImageUsage | null }
const clamp = (n: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, n))
const smooth = (n: number): number => { const p = clamp(n); return p * p * (3 - 2 * p) }
const kinds: Record<Kind, string> = { text: '文字', line: '直线', arrow: '箭头', rect: '矩形', circle: '圆形', image: '图片', vector: '手绘素材' }
function createItem(kind: Kind, image?: string): Item { return { id: crypto.randomUUID(), kind, x: .2, y: .22, w: kind === 'text' ? .44 : .26, h: kind === 'text' ? .18 : kind === 'vector' ? .34 : .24, color: '#30343b', lineWidth: 3, size: 44, text: '输入文字', image: kind === 'image' ? image : undefined, builtinId: kind === 'vector' ? image : undefined, duration: kind === 'vector' ? 4 : 2 } }
function totalTime(items: Item[]): number { return canvasTimeline(items).at(-1)?.end ?? 0 }
function drawPen(ctx: CanvasRenderingContext2D, x: number, y: number, pen: Pen): void {
  if (pen === 'none') return
  ctx.save(); ctx.translate(x, y); ctx.rotate(.38); ctx.lineWidth = 1.5; ctx.strokeStyle = '#30343b'
  ctx.fillStyle = pen === 'pencil' ? '#edbd60' : pen === 'marker' ? '#7685b3' : '#42475c'
  ctx.beginPath(); ctx.roundRect(-6, -69, 12, 55, 3); ctx.fill(); ctx.stroke()
  ctx.fillStyle = pen === 'pencil' ? '#efd4ad' : '#d9dce5'; ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(0, 0); ctx.lineTo(6, -14); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#30343b'; ctx.beginPath(); ctx.moveTo(-1.8, -4); ctx.lineTo(0, 0); ctx.lineTo(1.8, -4); ctx.closePath(); ctx.fill(); ctx.restore()
}
function drawItem(ctx: CanvasRenderingContext2D, item: Item, progress: number, images: Map<string, HTMLImageElement>): { x: number; y: number } {
  const { width, height } = ctx.canvas, x = item.x * width, y = item.y * height, w = item.w * width, h = item.h * height
  const p = smooth(progress); ctx.save(); ctx.lineWidth = item.lineWidth * width / 1280; ctx.strokeStyle = item.color; ctx.fillStyle = item.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  let tip = { x: x + w * p, y: y + h * .5 }
  if (item.kind === 'vector') {
    const asset = findBuiltin(item.builtinId)
    if (asset) {
      const side = Math.min(w, h), left = x + (w - side) / 2, top = y + (h - side) / 2
      ctx.save(); ctx.translate(left, top); ctx.scale(side / 128, side / 128)
      const point = drawBuiltin(ctx, asset, p); ctx.restore()
      tip = { x: left + point.x * side / 128, y: top + point.y * side / 128 }
    }
  } else if (item.kind === 'image') {
    const img = item.image ? images.get(item.image) : undefined
    if (img?.complete && img.naturalWidth) { const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight), iw = img.naturalWidth * scale, ih = img.naturalHeight * scale; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w * p, h); ctx.clip(); ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); ctx.restore() }
    tip = { x: x + w * p, y: y + h * (.5 + .24 * Math.sin(p * Math.PI * 5)) }
  } else if (item.kind === 'text') {
    const size = item.size * width / 1280, chars = Array.from(item.text); if (item.decoration) { ctx.save(); ctx.strokeStyle = item.decoration; ctx.lineWidth = 5 * width / 1280; ctx.beginPath(); ctx.moveTo(x, y + h * .7); ctx.lineTo(x + w * .75 * p, y + h * .7); ctx.stroke(); ctx.restore() }; ctx.font = `${size}px "Kaiti SC", serif`; ctx.textBaseline = 'top'
    let cx = x, cy = y, visible = p * chars.length
    for (const ch of chars) { if (ch === '\n') { cx = x; cy += size * 1.25; visible--; continue }; const cw = ctx.measureText(ch).width; if (cx + cw > x + w && cx > x) { cx = x; cy += size * 1.25 }; if (cy + size > y + h) break
      const q = clamp(visible), rows = /[，。！？；、,.!?;]/.test(ch) ? 1 : /[A-Za-z0-9]/.test(ch) ? 2 : 3, step = q * rows, row = Math.min(rows - 1, Math.floor(step)), fraction = q >= 1 ? 1 : smooth(step - row), forward = row % 2 === 0, band = size * 1.25 / rows
      if (q > 0) { ctx.save(); ctx.beginPath(); if (row > 0) ctx.rect(cx, cy, cw, band * row); ctx.rect(forward ? cx : cx + cw * (1-fraction), cy + band * row, cw * fraction, band); ctx.clip(); ctx.fillText(ch, cx, cy); ctx.restore(); tip = { x: cx + cw * (forward ? fraction : 1-fraction), y: cy + band * (row+.6) } }
      visible--; cx += cw }
  } else if (item.kind === 'line' || item.kind === 'arrow') {
    ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w * p, y + h / 2); ctx.stroke()
    if (item.kind === 'arrow' && p > .8) { const q = (p - .8) / .2; ctx.beginPath(); ctx.moveTo(x + w - w * .16 * q, y + h / 2 - h * .25 * q); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w - w * .16 * q, y + h / 2 + h * .25 * q); ctx.stroke() }
  } else if (item.kind === 'rect') {
    const pts = [[x, y], [x+w, y], [x+w, y+h], [x, y+h], [x, y]], step = p * 4, whole = Math.floor(step); ctx.beginPath(); ctx.moveTo(x, y); for (let i = 0; i < Math.min(whole, 4); i++) ctx.lineTo(pts[i+1][0], pts[i+1][1]); if (whole < 4) { const q = step - whole, a = pts[whole], b = pts[whole+1]; tip = { x: a[0]+(b[0]-a[0])*q, y: a[1]+(b[1]-a[1])*q }; ctx.lineTo(tip.x, tip.y) }; ctx.stroke(); if (p >= 1) tip = { x, y }
  } else { const angle = -Math.PI / 2 + 2 * Math.PI * p; ctx.beginPath(); ctx.ellipse(x+w/2, y+h/2, w/2, h/2, 0, -Math.PI/2, angle); ctx.stroke(); tip = { x: x+w/2+Math.cos(angle)*w/2, y: y+h/2+Math.sin(angle)*h/2 } }
  ctx.restore(); return tip
}
function paint(canvas: HTMLCanvasElement, items: Item[], images: Map<string, HTMLImageElement>, selected: string | null, time: number | null, pen: Pen, background: CanvasBackground): void {
  const ctx = canvas.getContext('2d'); if (!ctx) return
  const { width, height } = canvas; ctx.clearRect(0, 0, width, height); drawBackground(ctx, background, images)
  const timeline = canvasTimeline(items), timingById = new Map(timeline.map(entry => [entry.item.id, entry]))
  let penTip: { x: number; y: number } | null = null
  for (const item of items) {
    const timing = timingById.get(item.id)!
    const progress = time === null ? 1 : clamp((time - timing.start) / item.duration)
    if (time === null || progress > 0 || (time >= timing.start && time < timing.end)) {
      const tip = drawItem(ctx, item, progress, images)
      if (time !== null && time >= timing.start && time < timing.end) penTip = tip
    }
    if (time === null && item.id === selected) { ctx.save(); ctx.strokeStyle = '#5968d9'; ctx.lineWidth = 2; ctx.setLineDash([7, 4]); ctx.strokeRect(item.x*width, item.y*height, item.w*width, item.h*height); ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.fillRect((item.x+item.w)*width-5, (item.y+item.h)*height-5, 10, 10); ctx.strokeRect((item.x+item.w)*width-5, (item.y+item.h)*height-5, 10, 10); ctx.restore() }
  }
  if (time !== null && !penTip) {
    const nextIndex = timeline.findIndex(entry => time < entry.start)
    if (nextIndex >= 0) {
      const next = timeline[nextIndex], previous = timeline[nextIndex - 1]
      // Clip all pixels while asking the existing renderer for its exact start and end points.
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 0, 0); ctx.clip()
      const target = drawItem(ctx, next.item, .000001, images)
      const origin = previous ? drawItem(ctx, previous.item, 1, images) : { x: target.x + 35 * width / 1280, y: target.y - 35 * height / 720 }
      ctx.restore()
      const q = smooth(penTravelProgress(time, next.previousEnd, next.start))
      penTip = { x: origin.x + (target.x - origin.x) * q, y: origin.y + (target.y - origin.y) * q }
    }
  }
  if (penTip && time !== null) drawPen(ctx, penTip.x, penTip.y, pen)
}

function CanvasThumbnail({ items, background, ratio, images, imageVersion }: { items: Item[]; background: CanvasBackground; ratio: 'landscape' | 'vertical'; images: Map<string, HTMLImageElement>; imageVersion: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (ref.current) paint(ref.current, items, images, null, null, 'none', background) }, [items, background, ratio, images, imageVersion])
  return <span className="wb-canvas-thumbnail"><canvas ref={ref} width={ratio === 'vertical' ? 720 : 1280} height={ratio === 'vertical' ? 1280 : 720} aria-hidden="true"/></span>
}

export function WhiteboardCanvas({ onBack, onBusy }: { onBack: () => Promise<void>; onBusy: (busy: boolean) => void }) {
  const showMessage = useMessage()
  const initialProject = useRef(canvasProjectFromRoute(window.location.hash))
  const restoreStarted = useRef(false)
  const [restoring, setRestoring] = useState(() => initialProject.current !== null)
  const [voice, setVoice] = useState<CanvasProjectData['voice']>({ mode: 'local', configId: '', speaker: 'zh_female_vv_uranus_bigtts', speed: 1 })
  const [panels, setPanels] = useState<CanvasPanel[]>(() => [{ id: crypto.randomUUID(), name: '画布 1', items: [], background: defaultBackground, narration: '', holdSeconds: 2, ratio: 'landscape', history: [], future: [] }])
  const [activePanel, setActivePanel] = useState(0)
  const [confirmDeletePanel, setConfirmDeletePanel] = useState(false)
  const draggedPanel = useRef<number | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null), [revision, setRevision] = useState<string | null>(null), [projectName, setProjectName] = useState('未命名工程')
  const [projects, setProjects] = useState<CanvasProjectSummary[]>([]), [projectDialog, setProjectDialog] = useState(false), [editorOpen, setEditorOpen] = useState(false), [confirmReturn, setConfirmReturn] = useState(false), [projectsLoading, setProjectsLoading] = useState(true), [projectsFailed, setProjectsFailed] = useState(false), [saving, setSaving] = useState(false)
  const [items, setItems] = useState<Item[]>([]), [selected, setSelected] = useState<string | null>(null), [assets, setAssets] = useState<CanvasAsset[]>([])
  const [tab, setTab] = useState<'materials' | 'text' | 'image' | 'background' | 'ai' | 'mine'>('materials'), [candidate, setCandidate] = useState<CanvasAsset | null>(null)
  const [prompt, setPrompt] = useState(''), [usage, setUsage] = useState<Generated[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [zoom, setZoom] = useState(100), [background, setBackground] = useState<CanvasBackground>(defaultBackground)
  const [backgroundCandidate, setBackgroundCandidate] = useState<CanvasAsset | null>(null), [backgroundUsage, setBackgroundUsage] = useState<Generated[]>([]), [adjustBackground, setAdjustBackground] = useState(false)
  const backgroundDrag = useRef<{ x: number; y: number; bx: number; by: number; excessX: number; excessY: number } | null>(null)
  const [ratio, setRatio] = useState<'landscape' | 'vertical'>('landscape'), [pen, setPen] = useState<Pen>('pencil'), [time, setTime] = useState<number | null>(null), [playing, setPlaying] = useState(false), [exporting, setExporting] = useState(false), [confirmExit, setConfirmExit] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null), imagesRef = useRef(new Map<string, HTMLImageElement>()), drag = useRef<{ id: string; dx: number; dy: number; resize: boolean } | null>(null), last = useRef<number | null>(null), cancel = useRef(false), allowClose = useRef(false)
  const [imageVersion, setImageVersion] = useState(0)
  useEffect(() => { if (tab !== 'background') setAdjustBackground(false) }, [tab])
  const [history, setHistory] = useState<CanvasHistory[]>([]), [future, setFuture] = useState<CanvasHistory[]>([])
  const current = items.find(item => item.id === selected), timeline = useMemo(() => canvasTimeline(items), [items]), total = useMemo(() => totalTime(items), [items])
  const currentTiming = timeline.find(entry => entry.item.id === selected)
  const projectData: CanvasProjectData = { version: 1, voice, name: projectName, panels: panels.map((panel, index) => { const source = index === activePanel ? { ...panel, items, background, ratio } : panel; return { id: source.id, name: source.name, items: source.items, background: source.background, narration: source.narration, holdSeconds: source.holdSeconds, ratio: source.ratio } }), assets, activePanel, pen }
  const fingerprint = JSON.stringify(projectData)
  const [savedFingerprint, setSavedFingerprint] = useState(fingerprint)
  const dirty = fingerprint !== savedFingerprint
  async function refreshProjects(): Promise<void> { setProjectsLoading(true); setProjectsFailed(false); setError(''); const hasListProjects = typeof window.canvasApi?.listProjects === 'function'; try { if (!hasListProjects) throw new Error('画布工程接口不可用'); const result = await window.canvasApi.listProjects(); if (result.ok) setProjects(result.value); else { setProjectsFailed(true); showMessage(result.error, true) } } catch (error) { console.error('读取画布工程列表失败', error); setProjectsFailed(true); showMessage(canvasProjectListError(error, hasListProjects), true) } finally { setProjectsLoading(false) } }
  useEffect(() => { if (restoreStarted.current) return; restoreStarted.current = true; void (async () => { await refreshProjects(); if (initialProject.current) await openProject(initialProject.current); setRestoring(false) })() }, [])
  async function saveProject(): Promise<void> {
    if (saving || loading || exporting) return
    if (!projectName.trim()) { setError('请输入工程名称后保存。'); setProjectDialog(true); return }
    const data = { ...projectData, name: projectName.trim() }, saved = JSON.stringify(data)
    setSaving(true); setError('')
    try { const result = await window.canvasApi.saveProject(projectId, revision, data); if (!result.ok) { setError(result.error); return }; setProjectId(result.value.id); setRevision(result.value.revision); setProjectName(data.name); setSavedFingerprint(saved); await refreshProjects(); setError('工程已保存。') } catch { setError('工程保存失败，请重试。') } finally { setSaving(false) }
  }
  async function openProject(id: string): Promise<void> {
    setSaving(true); setError('')
    try {
      const result = await window.canvasApi.loadProject(id)
      if (!result.ok) { setError(result.error); return }
      const { id: nextId, revision: nextRevision, updatedAt: _updatedAt, ...data } = result.value
      const sources = new Set<string>()
      for (const asset of data.assets) { sources.add(asset.image); sources.add(asset.original) }
      for (const panel of data.panels) { if (panel.background.image) sources.add(panel.background.image); for (const item of panel.items) if (item.image) sources.add(item.image) }
      await Promise.all([...sources].map(prepareBackground))
      const nextPanels = data.panels.map(panel => ({ ...panel, items: panel.items.map((item, index) => ({ ...item, drawOrder: item.drawOrder ?? index, wait: item.wait ?? (index === 0 ? .3 : .45) })), history: [], future: [] })), active = nextPanels[data.activePanel]
      data.panels = nextPanels.map(({ history: _history, future: _future, ...panel }) => panel)
      setPanels(nextPanels); setActivePanel(data.activePanel); setItems(active.items); setBackground(active.background); setRatio(active.ratio); setHistory([]); setFuture([]); setAssets(data.assets); setPen(data.pen); setVoice(data.voice); setProjectId(nextId); setRevision(nextRevision); setProjectName(data.name); setSavedFingerprint(JSON.stringify(data)); setSelected(null); setPlaying(false); setTime(null); setAdjustBackground(false); setCandidate(null); setBackgroundCandidate(null); setProjectDialog(false); window.history.replaceState(null, '', canvasProjectRoute(nextId)); setEditorOpen(true)
    } catch { setError('工程或素材无法读取，当前内容已保留。') } finally { setSaving(false) }
  }
  async function newProject(): Promise<void> {
    const panel: CanvasPanel = { id: crypto.randomUUID(), name: '画布 1', items: [], background: defaultBackground, narration: '', holdSeconds: 2, ratio: 'landscape', history: [], future: [] }
    const data: CanvasProjectData = { version: 1, voice: { mode: 'local', configId: '', speaker: 'zh_female_vv_uranus_bigtts', speed: 1 }, name: '未命名工程', panels: [{ id: panel.id, name: panel.name, items: panel.items, background: panel.background, narration: panel.narration, holdSeconds: panel.holdSeconds, ratio: panel.ratio }], assets: [], activePanel: 0, pen: 'pencil' }
    setSaving(true); setError('')
    try {
      const result = await window.canvasApi.saveProject(null, null, data)
      if (!result.ok) { setError(result.error); return }
      setProjectId(result.value.id); setRevision(result.value.revision)
      setPanels([panel]); setActivePanel(0); setItems([]); setBackground(defaultBackground); setRatio('landscape'); setHistory([]); setFuture([]); setAssets([]); setPen('pencil'); setVoice(data.voice); setProjectName(data.name); setSavedFingerprint(JSON.stringify(data)); setSelected(null); setPlaying(false); setTime(null); setAdjustBackground(false); setCandidate(null); setBackgroundCandidate(null); setProjectDialog(false); window.history.replaceState(null, '', canvasProjectRoute(result.value.id)); setEditorOpen(true)
    } catch { setError('新建工程失败，请重试。') } finally { setSaving(false) }
  }
  function returnToLibrary(): void { window.history.replaceState(null, '', canvasProjectRoute(null)); setPlaying(false); setTime(null); setSavedFingerprint(fingerprint); setEditorOpen(false); setError(''); void refreshProjects() }

  useEffect(() => { onBusy(dirty || loading || exporting || saving); return () => onBusy(false) }, [dirty, loading, exporting, saving, onBusy])
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (!allowClose.current && (dirty || loading || exporting || saving)) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, loading, exporting, saving])
  useEffect(() => () => { cancel.current = true }, [])
  const repaint = useCallback(() => { if (canvasRef.current) paint(canvasRef.current, items, imagesRef.current, selected, time, pen, background) }, [items, selected, time, pen, background])
  useEffect(() => { repaint() }, [repaint, ratio, imageVersion, editorOpen])
  useEffect(() => { if (!playing || exporting) { last.current = null; return }; let frame = 0; const tick = (now: number) => { if (last.current !== null) { const delta = (now - last.current) / 1000; setTime(value => Math.min(total, (value ?? 0) + delta)) }; last.current = now; frame = requestAnimationFrame(tick) }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame) }, [playing, total, exporting])
  useEffect(() => { if (time !== null && time >= total && playing) setPlaying(false) }, [time, total, playing])
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target
      if (event.defaultPrevented || event.isComposing || event.repeat || exporting || loading || saving || confirmExit || confirmReturn || confirmDeletePanel || !editorOpen || !(target instanceof HTMLElement)) return
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') { event.preventDefault(); void saveProject(); return }
      if (projectDialog || target.closest('input, textarea, select, button, [contenteditable="true"], [role="dialog"]')) return
      if (event.code === 'Space' && !event.metaKey && !event.ctrlKey && !event.altKey && items.length) {
        event.preventDefault()
        if (playing) setPlaying(false)
        else { if (time === null || time >= total) setTime(0); setPlaying(true) }
      } else if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'z') {
        const from = event.shiftKey ? future : history, snapshot = from.at(-1)
        if (!snapshot) return
        event.preventDefault(); setPlaying(false); setTime(null); setSelected(null)
        if (event.shiftKey) { setHistory(old => [...old, { items, background }]); setFuture(old => old.slice(0, -1)) }
        else { setFuture(old => [...old, { items, background }]); setHistory(old => old.slice(0, -1)) }
        setItems(snapshot.items); setBackground(snapshot.background)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [items, background, history, future, loading, exporting, saving, confirmExit, confirmReturn, confirmDeletePanel, editorOpen, playing, time, total, projectDialog, fingerprint, projectId, revision])
  function switchPanel(index: number, create: 'empty' | 'copy' | null = null): void {
    if (create && panels.length >= 100) return
    const next = [...panels]
    next[activePanel] = { ...next[activePanel], items, background, ratio, history, future }
    if (create) {
      const used = new Set(next.map(panel => panel.name)); let number = 1
      while (used.has(`画布 ${number}`)) number++
      const source = next[activePanel]
      const panel: CanvasPanel = { id: crypto.randomUUID(), name: `画布 ${number}`, items: create === 'copy' ? items.map(item => ({ ...item, id: crypto.randomUUID() })) : [], background: create === 'copy' ? { ...background } : defaultBackground, narration: create === 'copy' ? source.narration : '', holdSeconds: create === 'copy' ? source.holdSeconds : 2, ratio: create === 'copy' ? ratio : 'landscape', history: [], future: [] }
      index = create === 'copy' ? activePanel + 1 : next.length
      next.splice(index, 0, panel)
    }
    const target = next[index]
    setPanels(next); setActivePanel(index); setItems(target.items); setBackground(target.background); setRatio(target.ratio); setHistory(target.history); setFuture(target.future)
    setSelected(null); setPlaying(false); setTime(null); setAdjustBackground(false); drag.current = null; backgroundDrag.current = null
  }
  function movePanel(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= panels.length || to >= panels.length) return
    const next = [...panels]
    next[activePanel] = { ...next[activePanel], items, background, ratio, history, future }
    const selectedId = next[activePanel].id
    const [moved] = next.splice(from, 1); next.splice(to, 0, moved)
    setPanels(next); setActivePanel(next.findIndex(panel => panel.id === selectedId))
  }
  function deletePanel(): void {
    if (panels.length <= 1) return
    const next = panels.filter((_, index) => index !== activePanel), index = Math.min(activePanel, next.length - 1), target = next[index]
    setPanels(next); setActivePanel(index); setItems(target.items); setBackground(target.background); setRatio(target.ratio); setHistory(target.history); setFuture(target.future)
    setSelected(null); setPlaying(false); setTime(null); setAdjustBackground(false); setConfirmDeletePanel(false)
  }
  function requestDeletePanel(): void {
    if (items.length || background.image || panels[activePanel].narration.length) setConfirmDeletePanel(true)
    else deletePanel()
  }
  function moveLayer(id: string, delta: -1 | 1): void {
    const index = items.findIndex(item => item.id === id), target = index + delta
    if (index < 0 || target < 0 || target >= items.length) return
    checkpoint()
    setItems(old => moveCanvasLayer(old, id, delta))
  }
  function selectListItem(id: string): void { setSelected(id); setPlaying(false); setTime(null); if (tab === 'background') setTab('materials') }
  function itemLabel(item: Item): string { return item.kind === 'text' ? item.text.trim().replace(/\s+/g, ' ').slice(0, 24) || '空文字' : item.kind === 'vector' ? findBuiltin(item.builtinId)?.name || kinds[item.kind] : kinds[item.kind] }
  function checkpoint(): void { setHistory(old => [...old.slice(-39), { items, background }]); setFuture([]); setPlaying(false); setTime(null) }
  function add(kind: Kind, image?: string, patch?: Partial<Item>): void { checkpoint(); const item = { ...createItem(kind, image), ...patch, drawOrder: items.length ? Math.max(...items.map((value, index) => value.drawOrder ?? index)) + 1 : 0, wait: items.length ? .45 : .3 }; setItems(old => [...old, item]); setSelected(item.id) }
  function update(patch: Partial<Item>, record = true): void { if (!current) return; if (record) checkpoint(); setItems(old => old.map(i => i.id === current.id ? { ...i, ...patch } : i)) }
  function addAsset(asset: CanvasAsset): void { for (const src of new Set([asset.image, asset.original])) { if (imagesRef.current.get(src)?.naturalWidth) continue; const image = new Image(); image.onload = () => setImageVersion(v => v + 1); image.src = src; imagesRef.current.set(src, image) }; setAssets(old => [...old, asset]) }
  async function importImage(): Promise<void> { setError(''); setLoading(true); try { const result = await window.canvasApi.importImage(); if (!result.ok) setError(result.error); else if (result.value) addAsset(result.value) } catch { setError('图片导入失败，请重试。') } finally { setLoading(false) } }
  async function generate(): Promise<void> { if (!prompt.trim()) return; setError(''); setLoading(true); const name = prompt.trim(); try { const result = await window.canvasApi.generateImage(name); if (!result.ok) { setError(result.error); setUsage(old => [...old, { name, model: '未知', status: '失败', usage: null }]) } else { addAsset(result.value.asset); setCandidate(result.value.asset); setUsage(old => [...old, { name, model: result.value.model, status: '成功', usage: result.value.usage }]) } } catch { setError('素材生成失败，请重试。'); setUsage(old => [...old, { name, model: '未知', status: '失败', usage: null }]) } finally { setLoading(false) } }
  async function prepareBackground(src: string): Promise<void> { if (imagesRef.current.get(src)?.naturalWidth) return; const image = new Image(); image.src = src; await image.decode(); if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片无法读取，请选择其他图片。'); imagesRef.current.set(src, image); setImageVersion(v => v + 1) }
  async function selectBackground(asset: CanvasAsset): Promise<void> { try { await prepareBackground(asset.original); checkpoint(); setBackground(old => ({ ...old, image: asset.original, name: asset.name, mode: 'cover', scale: 1, x: .5, y: .5 })); setAdjustBackground(false); setError('') } catch { setError('背景图片加载失败，原背景已保留。') } }
  async function importBackground(): Promise<void> { setLoading(true); setError(''); try { const result = await window.canvasApi.importImage(); if (!result.ok) setError(result.error); else if (result.value) { await selectBackground(result.value); addAsset(result.value) } } catch { setError('背景图片导入失败，原背景已保留。') } finally { setLoading(false) } }
  async function generateBackground(description: string): Promise<void> { setLoading(true); setError(''); try { const result = await window.canvasApi.generateImage(description, 'background', ratio); if (!result.ok) { setError(result.error); setBackgroundUsage(old => [...old, { name: description, model: '未知', status: '失败', usage: null }]) } else { await prepareBackground(result.value.asset.original); addAsset(result.value.asset); setBackgroundCandidate(result.value.asset); setBackgroundUsage(old => [...old, { name: description, model: result.value.model, status: '成功', usage: result.value.usage }]) } } catch { setError('背景生成或加载失败，原背景已保留。'); setBackgroundUsage(old => [...old, { name: description, model: '未知', status: '失败', usage: null }]) } finally { setLoading(false) } }
  async function selectPreset(kind: 'paper' | 'grid' | 'dots'): Promise<void> { try { const src = createBackgroundTile(kind); await prepareBackground(src); checkpoint(); setBackground(old => ({ ...old, image: src, name: { paper: '暖色纸张', grid: '浅色网格', dots: '浅色圆点' }[kind], mode: 'tile', scale: 1, x: .5, y: .5 })); setAdjustBackground(false); setError('') } catch { setError('内置背景加载失败，原背景已保留。') } }
  function changeBackground(patch: Partial<CanvasBackground>): void { checkpoint(); setBackground(old => ({ ...old, ...patch })) }
  async function closeEditor(): Promise<void> { allowClose.current = true; try { await onBack() } catch { allowClose.current = false; setError('无法关闭画布，请重试。') } }
  function point(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } { const rect = event.currentTarget.getBoundingClientRect(); return { x: clamp((event.clientX-rect.left)/rect.width), y: clamp((event.clientY-rect.top)/rect.height) } }
  async function exportVideo(): Promise<void> {
    const canvas = canvasRef.current; if (!canvas || !items.length) return
    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) { setError('当前环境不支持视频录制。'); return }
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(v => MediaRecorder.isTypeSupported(v)); if (!mime) { setError('当前环境不支持 WebM 视频录制。'); return }
    cancel.current = false; setPlaying(false); setExporting(true); setError(''); let stream: MediaStream | null = null
    try {
      await Promise.all([...imagesRef.current.values()].map(img => img.decode()))
      if (cancel.current) return
      paint(canvas, items, imagesRef.current, null, 0, pen, background); stream = canvas.captureStream(30)
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 }), chunks: Blob[] = []
      let recordingFailed = false
      const finished = new Promise<void>(resolve => { recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }; recorder.onstop = () => resolve(); recorder.onerror = () => { recordingFailed = true; resolve() } })
      recorder.start(250); const start = performance.now()
      await new Promise<void>(resolve => { function tick(now: number) { const elapsed = Math.min(total, (now-start)/1000); paint(canvas!, items, imagesRef.current, null, elapsed, pen, background); if (cancel.current || recordingFailed || elapsed >= total) { resolve(); return }; requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
      if (recorder.state !== 'inactive') recorder.stop(); await finished
      if (cancel.current) return
      if (recordingFailed) throw new Error('视频录制失败，请重试。')
      const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()); const result = await window.canvasApi.saveVideo(bytes); if (!result.ok) setError(result.error); else if (result.value) setError(`视频已保存：${result.value}`)
    } catch (e) { setError(e instanceof Error ? e.message : '导出失败，请重试。') } finally { stream?.getTracks().forEach(track => track.stop()); setExporting(false); setTime(null); repaint() }
  }
  if (restoring) return <section className="wb-canvas-page"><div className="wb-route-loading" role="status">正在打开画布工程…</div></section>
  if (!editorOpen) return <section className="wb-canvas-page"><header className="wb-canvas-header"><div className="wb-canvas-brand"><span className="wb-canvas-brandmark"><Sparkles aria-hidden="true"/></span><strong>灵稿 AI</strong><span className="wb-canvas-divider"/><span className="wb-canvas-breadcrumb">白板动画 /</span><h1>画布工作台</h1></div><div className="wb-canvas-header-actions"><Button size="sm" variant="outline" disabled={saving} onClick={() => void closeEditor()}>关闭画布</Button></div></header><main className="wb-library"><div className="wb-library-heading"><div><h2>画布工程</h2><p>管理和编辑你的画布工程</p></div><Button disabled={saving || projectsLoading} onClick={() => void newProject()}><Plus aria-hidden="true"/>{saving ? '正在新建…' : '新建工程'}</Button></div>{error && <p className="wb-library-notice" role="alert">{error}</p>}<div className="wb-library-subheading"><h3>我的工程</h3><span>{projectsLoading ? '正在加载…' : `${projects.length} 个工程`}</span></div>{projectsLoading ? <p className="wb-library-empty" role="status">正在加载工程…</p> : projectsFailed ? <div className="wb-library-empty"><p>工程列表加载失败。</p><Button variant="outline" onClick={() => void refreshProjects()}>重试</Button></div> : projects.length === 0 ? <div className="wb-library-empty"><Shapes aria-hidden="true"/><strong>还没有画布工程</strong><p>新建工程，开始制作画布。</p><Button disabled={saving} onClick={() => void newProject()}><Plus aria-hidden="true"/>新建工程</Button></div> : <div className="wb-library-grid">{projects.map(project => <button type="button" className="wb-library-card" key={project.id} disabled={saving} onClick={() => void openProject(project.id)}><span className="wb-library-cover"><Shapes aria-hidden="true"/></span><span className="wb-library-card-body"><strong title={project.name}>{project.name}</strong><span>更新于 {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(project.updatedAt))}</span></span><ChevronRight className="wb-library-arrow" aria-hidden="true"/></button>)}</div>}</main></section>
  return <section className="wb-canvas-page">
    <header className="wb-canvas-header"><div className="wb-canvas-brand"><span className="wb-canvas-brandmark"><Sparkles aria-hidden="true"/></span><strong>灵稿 AI</strong><span className="wb-canvas-divider"/><span className="wb-canvas-breadcrumb">白板动画 /</span><h1>画布工作台</h1></div><div className="wb-canvas-header-actions"><Button size="sm" variant="ghost" disabled={loading || exporting || saving} onClick={() => dirty ? setConfirmReturn(true) : returnToLibrary()}><ArrowLeft aria-hidden="true"/>工程列表</Button><Button size="sm" variant="ghost" disabled={loading || exporting || saving} onClick={() => setProjectDialog(true)} title="修改工程名称">{projectName}</Button><span>{dirty ? '未保存' : '已保存'}</span><Button size="sm" variant="outline" disabled={loading || exporting || saving} onClick={() => void saveProject()}>保存</Button><Button size="sm" variant="outline" disabled={loading || exporting || saving} onClick={() => dirty ? setConfirmExit(true) : void closeEditor()}>关闭画布</Button></div></header>
    {error && <p className="wb-canvas-notice" role="status">{error}</p>}
    <div className="wb-canvas-workspace">
      <nav className="wb-canvas-rail" aria-label="画布工具">{([{ id: 'materials', label: '素材', icon: Shapes }, { id: 'text', label: '文字', icon: Type }, { id: 'image', label: '图片', icon: ImageIcon }, { id: 'background', label: '背景', icon: Palette }, { id: 'ai', label: 'AI 生成', icon: Sparkles }, { id: 'mine', label: '我的素材', icon: FolderHeart }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => { setTab(id); if (id === 'background') setSelected(null) }}><Icon aria-hidden="true"/><span>{label}</span></button>)}</nav>
      <aside className="wb-canvas-sidebar wb-canvas-materials"><div className="wb-canvas-panel-head"><h2>{({ materials: '素材', text: '文字', image: '图片', background: '背景', ai: 'AI 生成', mine: '我的素材' } as const)[tab]}</h2></div>
        <div hidden={tab === 'text' || tab === 'ai' || tab === 'background'}><WhiteboardBuiltinPicker panel={tab === 'image' || tab === 'background' || tab === 'mine' ? tab : 'materials'} disabled={loading || exporting} assets={assets} background={background.color} onBackground={color => changeBackground({ color })} onAdd={id => add('vector', id)} onBasic={kind => add(kind)} onText={(text, color) => add('text', undefined, { text, color: '#30343b', decoration: color, size: 44, w: .4, h: .16 })} onAsset={(asset, original) => add('image', original ? asset.original : asset.image)} onImport={() => void importImage()}/></div>
        {tab === 'background' && <WhiteboardBackgroundPanel background={background} disabled={loading || exporting} onChange={patch => { setSelected(null); changeBackground(patch) }} onSelect={asset => { setSelected(null); void selectBackground(asset) }} onPreset={kind => { setSelected(null); void selectPreset(kind) }}/>}
        {tab === 'text' && <div className="wb-canvas-panel-body wb-canvas-text-panel"><Button className="wb-canvas-generate" disabled={loading || exporting} onClick={() => add('text')}><Type aria-hidden="true"/>添加文字</Button><p className="wb-canvas-hint">添加后可在右侧修改文字内容、大小和颜色。</p></div>}{tab === 'ai' && <div className="wb-canvas-panel-body"><label htmlFor="canvas-prompt">描述你想要的素材</label><Textarea id="canvas-prompt" rows={4} maxLength={300} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="例如：背着书包向前走的人，手绘插画风格…"/><p className="wb-canvas-hint">使用当前图片模型，可能产生费用。请检查图片及素材许可。</p><Button className="wb-canvas-generate" disabled={loading || exporting || !prompt.trim()} onClick={() => void generate()}><Sparkles aria-hidden="true"/>{loading ? '正在生成…' : '生成素材'}</Button>{candidate && <div className="wb-canvas-candidate"><div className="wb-canvas-section-title"><h3>生成结果</h3><span>可继续编辑</span></div><div className="wb-canvas-candidate-image"><img src={candidate.image} width={200} height={160} alt={candidate.name}/></div><p className="wb-canvas-hint">{candidate.name}</p><Button className="wb-canvas-generate" disabled={exporting} onClick={() => add('image', candidate.image)}>放入画布</Button>{candidate.backgroundRemoved && <Button className="wb-canvas-generate" variant="outline" disabled={exporting} onClick={() => add('image', candidate.original)}>放入原图</Button>}</div>}{usage.length > 0 && <details className="wb-canvas-usage"><summary>图片模型用量</summary>{usage.map((u, i) => <p key={i}>{u.name} · {u.model} · {u.status}<br/>输入 {u.usage?.inputTokens ?? '未提供'} / 输出 {u.usage?.outputTokens ?? '未提供'} / 合计 {u.usage?.totalTokens ?? '未提供'}</p>)}</details>}</div>}
      </aside>
      <div className="wb-canvas-main"><div className="wb-canvas-toolbar"><strong>画布</strong><Button size="icon-sm" variant="ghost" aria-label="撤销" title="撤销" disabled={!history.length || exporting} onClick={() => { const old = history.at(-1); if (old) { setFuture(v => [...v, { items, background }]); setItems(old.items); setBackground(old.background); setHistory(v => v.slice(0,-1)); setSelected(null); setTime(null) } }}><Undo2/></Button><Button size="icon-sm" variant="ghost" aria-label="重做" title="重做" disabled={!future.length || exporting} onClick={() => { const next = future.at(-1); if (next) { setHistory(v => [...v, { items, background }]); setItems(next.items); setBackground(next.background); setFuture(v => v.slice(0,-1)); setSelected(null); setTime(null) } }}><Redo2/></Button><span className="wb-canvas-toolbar-spacer"/><label><span className="sr-only">画笔</span><select value={pen} disabled={exporting} onChange={e => { const v = e.target.value; if (v === 'pencil' || v === 'marker' || v === 'fountain' || v === 'none') setPen(v) }}><option value="pencil">铅笔</option><option value="marker">马克笔</option><option value="fountain">钢笔</option><option value="none">不显示画笔</option></select></label><label><span className="sr-only">画布比例</span><select value={ratio} disabled={exporting} onChange={e => { setRatio(e.target.value === 'vertical' ? 'vertical' : 'landscape'); setTime(null) }}><option value="landscape">横屏 16:9</option><option value="vertical">竖屏 9:16</option></select></label></div><div className="wb-canvas-stage"><div className={`wb-canvas-frame ${ratio === 'vertical' ? 'vertical' : ''}`} style={{ width: `${ratio === 'vertical' ? 52 * zoom / 100 : zoom}%`, maxWidth: `${(ratio === 'vertical' ? 430 : 1100) * zoom / 100}px` }}><div className="wb-canvas-frame-label"><strong>{panels[activePanel].name}</strong><span>{ratio === 'vertical' ? '9 : 16' : '16 : 9'}</span></div><canvas ref={canvasRef} width={ratio === 'vertical' ? 720 : 1280} height={ratio === 'vertical' ? 1280 : 720} className={ratio === 'vertical' ? 'vertical' : ''} tabIndex={0} aria-label="白板画布，选择元素后可用方向键移动或按 Delete 删除" onPointerDown={e => { if (exporting) return; setPlaying(false); setTime(null); if (adjustBackground && background.image && background.mode === 'cover') { const img = imagesRef.current.get(background.image); if (img?.naturalWidth) { const rect = coverRect(e.currentTarget.width, e.currentTarget.height, img.naturalWidth, img.naturalHeight, background.scale, background.x, background.y); checkpoint(); backgroundDrag.current = { x: e.clientX, y: e.clientY, bx: background.x, by: background.y, excessX: Math.max(0, rect.width - e.currentTarget.width), excessY: Math.max(0, rect.height - e.currentTarget.height) }; e.currentTarget.setPointerCapture(e.pointerId) }; return }; const p = point(e), bounds = e.currentTarget.getBoundingClientRect(), corner = current && Math.abs(p.x-(current.x+current.w))*bounds.width < 12 && Math.abs(p.y-(current.y+current.h))*bounds.height < 12, hit = corner ? current : [...items].reverse().find(i => p.x >= i.x && p.x <= i.x+i.w && p.y >= i.y && p.y <= i.y+i.h); setSelected(hit?.id ?? null); if (hit) { checkpoint(); drag.current = { id: hit.id, dx: p.x-hit.x, dy: p.y-hit.y, resize: !!corner }; e.currentTarget.setPointerCapture(e.pointerId) } }} onPointerMove={e => { if (backgroundDrag.current) { const d = backgroundDrag.current, bounds = e.currentTarget.getBoundingClientRect(); setBackground(old => ({ ...old, x: d.excessX ? clamp(d.bx - (e.clientX-d.x) * e.currentTarget.width / bounds.width / d.excessX) : d.bx, y: d.excessY ? clamp(d.by - (e.clientY-d.y) * e.currentTarget.height / bounds.height / d.excessY) : d.by })); return }; if (!drag.current) return; const d = drag.current, p = point(e); setItems(old => old.map(i => i.id === d.id ? d.resize ? { ...i, w: clamp(p.x-i.x, .03, 1-i.x), h: clamp(p.y-i.y, .03, 1-i.y) } : { ...i, x: clamp(p.x-d.dx, 0, 1-i.w), y: clamp(p.y-d.dy, 0, 1-i.h) } : i)) }} onPointerUp={() => { drag.current = null; backgroundDrag.current = null }} onPointerCancel={() => { drag.current = null; backgroundDrag.current = null }} onKeyDown={e => { if (adjustBackground || !current) return; const delta = e.shiftKey ? .05 : .01; if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); checkpoint(); setItems(v => v.filter(i => i.id !== current.id)); setSelected(null) } else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) { e.preventDefault(); update({ x: clamp(current.x+(e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0), 0, 1-current.w), y: clamp(current.y+(e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0), 0, 1-current.h) }) } }}/></div></div><div className="wb-canvas-play"><Button disabled={!items.length || exporting} onClick={() => { if (playing) setPlaying(false); else { if (time === null || time >= total) setTime(0); setPlaying(true) } }}>{playing ? <Pause/> : <Play/>}{playing ? '暂停' : '播放预览'}</Button><Button variant="outline" disabled={!items.length || exporting} onClick={() => { setTime(0); setPlaying(true) }}><RotateCcw/>重播</Button><input type="range" aria-label="播放进度" min={0} max={total || 1} step={.05} value={time ?? 0} disabled={!items.length || exporting} onChange={e => { setPlaying(false); setTime(Number(e.target.value)) }}/><span>{(time ?? 0).toFixed(1)} / {total.toFixed(1)} 秒</span>{exporting ? <Button variant="outline" onClick={() => { cancel.current = true }}>取消导出</Button> : <Button variant="outline" disabled={!items.length || loading} onClick={() => void exportVideo()}>导出视频</Button>}</div><div className="wb-canvas-bottom"><span>{exporting ? '正在录制无声视频，请保持页面打开…' : '点击选中 · 拖动移动 · 空格播放 · 方向键微调'}</span><div className="wb-canvas-zoom"><button type="button" aria-label="缩小画布" disabled={zoom <= 60 || exporting} onClick={() => setZoom(v => Math.max(60, v - 10))}><Minus aria-hidden="true"/></button><span>{zoom}%</span><button type="button" aria-label="放大画布" disabled={zoom >= 120 || exporting} onClick={() => setZoom(v => Math.min(120, v + 10))}><Plus aria-hidden="true"/></button></div></div><nav className="wb-canvas-panels" aria-label="画布面板"><div className="wb-canvas-panel-list">{panels.map((panel, index) => <button type="button" key={panel.id} aria-current={index === activePanel ? "true" : undefined} disabled={loading || exporting} draggable={!loading && !exporting} onDragStart={event => { draggedPanel.current = index; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)) }} onDragOver={event => { if (draggedPanel.current !== null) { event.preventDefault(); event.dataTransfer.dropEffect = "move" } }} onDrop={event => { event.preventDefault(); if (draggedPanel.current !== null) movePanel(draggedPanel.current, index); draggedPanel.current = null }} onDragEnd={() => { draggedPanel.current = null }} onClick={() => switchPanel(index)}><CanvasThumbnail items={index === activePanel ? items : panel.items} background={index === activePanel ? background : panel.background} ratio={index === activePanel ? ratio : panel.ratio} images={imagesRef.current} imageVersion={imageVersion}/><span>{panel.name}</span></button>)}</div><div className="wb-panel-actions" role="group" aria-label="当前画布操作"><Button size="icon-sm" variant="ghost" aria-label="画布左移" title="画布左移" disabled={activePanel === 0 || loading || exporting} onClick={() => movePanel(activePanel, activePanel - 1)}><ChevronLeft aria-hidden="true"/></Button><Button size="icon-sm" variant="ghost" aria-label="画布右移" title="画布右移" disabled={activePanel === panels.length - 1 || loading || exporting} onClick={() => movePanel(activePanel, activePanel + 1)}><ChevronRight aria-hidden="true"/></Button><Button size="icon-sm" variant="ghost" aria-label="删除当前画布" title="删除当前画布" disabled={panels.length <= 1 || loading || exporting} onClick={requestDeletePanel}><Trash2 aria-hidden="true"/></Button></div><label className="wb-panel-hold">停留 <input aria-label="当前画布完整画面停留时间（秒）" type="number" min="0" max="60" step="0.5" value={panels[activePanel].holdSeconds} disabled={loading || exporting} onChange={event => { const value = event.currentTarget.valueAsNumber; if (Number.isFinite(value)) setPanels(old => old.map((panel, index) => index === activePanel ? { ...panel, holdSeconds: clamp(value, 0, 60) } : panel)) }}/> 秒</label><Button className="wb-canvas-copy-panel" size="icon-sm" variant="ghost" aria-label="复制当前画布" title="复制当前画布" disabled={loading || exporting || panels.length >= 100} onClick={() => switchPanel(panels.length, 'copy')}><Copy aria-hidden="true"/></Button><Button className="wb-canvas-add-panel" size="icon-sm" variant="outline" aria-label="新建画布" title="新建画布" disabled={loading || exporting || panels.length >= 100} onClick={() => switchPanel(panels.length, 'empty')}><Plus aria-hidden="true"/></Button></nav></div>
      <aside className="wb-canvas-sidebar wb-canvas-properties"><fieldset disabled={exporting}><section className="wb-canvas-narration"><label htmlFor="canvas-narration">本页旁白</label><Textarea id="canvas-narration" rows={4} maxLength={10000} placeholder="输入这张画布的讲解内容…" value={panels[activePanel].narration} onChange={event => { const narration = event.target.value; setPanels(old => old.map((panel, index) => index === activePanel ? { ...panel, narration } : panel)) }}/></section><CanvasVoicePanel projectId={projectId} revision={revision} data={projectData} activePanel={activePanel} dirty={dirty} disabled={loading || exporting || saving} onChange={setVoice} onBusy={setLoading}/><Tabs.Root defaultValue="layers" className="wb-draw-order"><Tabs.List className="wb-panel-tabs" aria-label="画布面板"><Tabs.Trigger value="layers">图层</Tabs.Trigger><Tabs.Trigger value="animation">动画</Tabs.Trigger></Tabs.List><Tabs.Content value="layers" className="wb-panel-tab-content" aria-label="图层顺序">{items.length ? <><p className="wb-panel-hint">列表上方的图层显示在前面</p><ol>{[...items].reverse().map((item, index) => <li key={item.id}><button type="button" className="wb-draw-select" aria-pressed={selected === item.id} onClick={() => selectListItem(item.id)}><span>{index + 1}</span><span>{itemLabel(item)}</span></button><Button variant="ghost" size="icon-sm" aria-label={`上移图层 ${itemLabel(item)}`} title="上移一层" disabled={index === 0} onClick={() => moveLayer(item.id, 1)}><ChevronUp aria-hidden="true"/></Button><Button variant="ghost" size="icon-sm" aria-label={`下移图层 ${itemLabel(item)}`} title="下移一层" disabled={index === items.length - 1} onClick={() => moveLayer(item.id, -1)}><ChevronDown aria-hidden="true"/></Button></li>)}</ol></> : <p>添加元素后可在这里管理图层。</p>}</Tabs.Content><Tabs.Content value="animation" className="wb-panel-tab-content" aria-label="动画绘制顺序">{timeline.length ? <><p className="wb-panel-hint">按列表顺序依次绘制</p><ol>{timeline.map(({ item }, index) => <li key={item.id}><button type="button" className="wb-draw-select" aria-pressed={selected === item.id} onClick={() => selectListItem(item.id)}><span>{index + 1}</span><span>{itemLabel(item)}</span></button><Button variant="ghost" size="icon-sm" aria-label={`将 ${itemLabel(item)} 提前绘制`} title="提前绘制" disabled={index === 0} onClick={() => { checkpoint(); setItems(old => moveCanvasDrawOrder(old, item.id, -1)) }}><ChevronUp aria-hidden="true"/></Button><Button variant="ghost" size="icon-sm" aria-label={`将 ${itemLabel(item)} 延后绘制`} title="延后绘制" disabled={index === timeline.length - 1} onClick={() => { checkpoint(); setItems(old => moveCanvasDrawOrder(old, item.id, 1)) }}><ChevronDown aria-hidden="true"/></Button></li>)}</ol></> : <p>添加元素后可调整绘制顺序。</p>}</Tabs.Content></Tabs.Root>{tab === 'background' && !current ? <WhiteboardBackgroundProperties background={background} assets={assets} disabled={loading || exporting} loading={loading} candidate={backgroundCandidate} usage={backgroundUsage} adjusting={adjustBackground} onAdjusting={setAdjustBackground} onChange={changeBackground} onSelect={asset => void selectBackground(asset)} onImport={() => void importBackground()} onGenerate={description => void generateBackground(description)}/> : <><h2>属性</h2><p className="wb-canvas-panel-sub">调整画布中的元素</p>{!current ? <p>选择画布中的元素以调整属性。</p> : <><div className="wb-canvas-property-title"><h3>{kinds[current.kind]}</h3><Button variant="ghost" size="icon-sm" aria-label="删除元素" disabled={exporting} onClick={() => { checkpoint(); setItems(v => v.filter(i => i.id !== current.id)); setSelected(null) }}><Trash2/></Button></div>{current.kind === 'vector' && <p>内置路径素材 · 支持描线</p>}{current.kind === 'image' && <p>PNG 图片 · 擦出效果</p>}{current.kind === 'text' && <><label htmlFor="canvas-text">文字内容</label><Textarea id="canvas-text" value={current.text} maxLength={120} onFocus={checkpoint} onChange={e => update({ text: e.target.value }, false)}/><label htmlFor="canvas-size">文字大小</label><input id="canvas-size" type="number" min="12" max="100" value={current.size} onChange={e => update({ size: clamp(Number(e.target.value), 12, 100) })}/></>}{current.kind !== 'image' && current.kind !== 'vector' && <><label htmlFor="canvas-color">颜色</label><input id="canvas-color" type="color" value={current.color} onChange={e => update({ color: e.target.value })}/>{current.kind !== 'text' && <><label htmlFor="canvas-line-width">线宽</label><input id="canvas-line-width" type="number" min="1" max="12" value={current.lineWidth} onChange={e => update({ lineWidth: clamp(Number(e.target.value), 1, 12) })}/></>}</>}<div className="wb-canvas-fields">{(['x','y','w','h'] as const).map((key, i) => <label key={key}>{['水平位置 %','垂直位置 %','宽度 %','高度 %'][i]}<input type="number" min={key === 'w' || key === 'h' ? 3 : 0} max={100} value={Math.round(current[key]*100)} onChange={e => { const n = clamp(Number(e.target.value)/100, key === 'w' || key === 'h' ? .03 : 0, key === 'x' ? 1-current.w : key === 'y' ? 1-current.h : key === 'w' ? 1-current.x : 1-current.y); update({ [key]: n }) }}/></label>)}</div><section className="wb-draw-settings"><h3>绘制设置</h3><label htmlFor="canvas-wait">绘制前等待（秒）</label><input id="canvas-wait" type="number" min="0" max="60" step="0.1" value={currentTiming?.wait ?? 0} onChange={e => { if (e.target.value !== '') update({ wait: clamp(Number(e.target.value), 0, 60) }) }}/><label htmlFor="canvas-duration">绘制时长（秒）</label><input id="canvas-duration" type="number" min="0.5" max="12" step="0.5" value={current.duration} onChange={e => update({ duration: clamp(Number(e.target.value), .5, 12) })}/>{currentTiming && <p>预计 {currentTiming.start.toFixed(1)} 秒开始 · {currentTiming.end.toFixed(1)} 秒结束</p>}</section></>}</>}</fieldset></aside>
    </div><Dialog open={projectDialog} onOpenChange={setProjectDialog}><DialogContent><DialogHeader><DialogTitle>工程设置</DialogTitle><DialogDescription>修改工程名称后保存工程。</DialogDescription></DialogHeader>{error && <p role="status">{error}</p>}<label className="wb-project-name">工程名称<input value={projectName} maxLength={80} onChange={event => setProjectName(event.target.value)} disabled={saving}/></label><DialogFooter><Button variant="outline" onClick={() => setProjectDialog(false)}>关闭</Button><Button disabled={saving || !projectName.trim()} onClick={() => void saveProject()}>{saving ? '保存中…' : '保存工程'}</Button></DialogFooter></DialogContent></Dialog><Dialog open={confirmDeletePanel} onOpenChange={setConfirmDeletePanel}><DialogContent><DialogHeader><DialogTitle>删除当前画布？</DialogTitle><DialogDescription>画布中的内容、背景和旁白将被删除，保存工程后无法恢复。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmDeletePanel(false)}>取消</Button><Button variant="destructive" onClick={deletePanel}>删除画布</Button></DialogFooter></DialogContent></Dialog><Dialog open={confirmReturn} onOpenChange={setConfirmReturn}><DialogContent><DialogHeader><DialogTitle>返回工程列表？</DialogTitle><DialogDescription>当前工程有未保存的更改。返回后这些更改将丢失，你可以先取消并保存。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmReturn(false)}>继续编辑</Button><Button variant="destructive" onClick={() => { setConfirmReturn(false); returnToLibrary() }}>放弃更改并返回</Button></DialogFooter></DialogContent></Dialog><Dialog open={confirmExit} onOpenChange={setConfirmExit}><DialogContent><DialogHeader><DialogTitle>关闭画布？</DialogTitle><DialogDescription>当前工程有未保存的更改，关闭后这些更改将丢失。已保存的工程和导出的视频不会受影响。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmExit(false)}>继续编辑</Button><Button variant="destructive" onClick={() => { setConfirmExit(false); void closeEditor() }}>关闭画布</Button></DialogFooter></DialogContent></Dialog>
  </section>
}
