import { builtinAssets, materialShapes, type BuiltinAsset } from './whiteboard-builtin'

interface Stroke { path: SVGPathElement; length: number }
interface Prepared { asset: BuiltinAsset; outlines: Stroke[]; length: number }
const cache = new Map<string, Prepared>()
export function findBuiltin(id: string | undefined): BuiltinAsset | undefined { return [...builtinAssets, ...materialShapes].find(item => item.id === id) }
function prepare(asset: BuiltinAsset): Prepared {
  const existing = cache.get(asset.id)
  if (existing) return existing
  // Each M starts a separate stroke, so the pen does not draw across lifts.
  const outlines = asset.paths.filter(item => item.stroke !== false).flatMap(item => item.d.split(/(?=M)/).filter(Boolean).map(d => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    return { path, length: path.getTotalLength() }
  }))
  const prepared = { asset, outlines, length: outlines.reduce((sum, stroke) => sum + stroke.length, 0) }
  cache.set(asset.id, prepared)
  return prepared
}
/** Coordinates are in the 128×128 source viewBox; the caller owns the transform. */
export function drawBuiltin(ctx: CanvasRenderingContext2D, asset: BuiltinAsset, progress: number): { x: number; y: number } {
  const data = prepare(asset), p = Math.max(0, Math.min(1, progress))
  // Colors appear after the outlines instead of being mistaken for drawn strokes.
  if (p > .84) {
    ctx.save(); ctx.globalAlpha *= Math.min(1, (p - .84) / .16)
    for (const part of asset.paths) if (part.fill !== 'none') { ctx.fillStyle = part.fill; ctx.fill(new Path2D(part.d)) }
    ctx.restore()
  }
  ctx.save(); ctx.strokeStyle = '#333940'; ctx.lineWidth = asset.strokeWidth ?? 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  let remaining = data.length * Math.min(1, p / .84), tip = { x: 64, y: 64 }
  for (const part of data.outlines) {
    const visible = Math.max(0, Math.min(part.length, remaining))
    if (visible > 0 && part.length > 0) {
      const start = part.path.getPointAtLength(0); ctx.beginPath(); ctx.moveTo(start.x, start.y)
      const steps = Math.max(1, Math.ceil(visible / 2))
      for (let i = 1; i <= steps; i++) { const point = part.path.getPointAtLength(visible * i / steps); ctx.lineTo(point.x, point.y); tip = { x: point.x, y: point.y } }
      ctx.stroke()
    }
    remaining -= part.length
    if (remaining <= 0) break
  }
  ctx.restore(); return tip
}
