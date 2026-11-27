export interface CanvasBackground {
  color: string
  image: string | null
  name: string
  mode: 'cover' | 'tile'
  scale: number
  x: number
  y: number
}
export const defaultBackground: CanvasBackground = { color: '#ffffff', image: null, name: '', mode: 'cover', scale: 1, x: .5, y: .5 }
export function coverRect(width: number, height: number, imageWidth: number, imageHeight: number, scale: number, x: number, y: number) {
  const factor = Math.max(width / imageWidth, height / imageHeight) * scale
  const w = imageWidth * factor, h = imageHeight * factor
  return { x: (width - w) * x, y: (height - h) * y, width: w, height: h }
}
export function drawBackground(ctx: CanvasRenderingContext2D, background: CanvasBackground, images: Map<string, HTMLImageElement>): void {
  const { width, height } = ctx.canvas
  ctx.fillStyle = background.color; ctx.fillRect(0, 0, width, height)
  const image = background.image ? images.get(background.image) : undefined
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return
  ctx.save()
  if (background.mode === 'cover') {
    const rect = coverRect(width, height, image.naturalWidth, image.naturalHeight, background.scale, background.x, background.y)
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height)
  } else {
    const w = Math.min(width, height) * .18 * background.scale
    const pattern = ctx.createPattern(image, 'repeat')
    if (pattern) { pattern.setTransform(new DOMMatrix().scale(w / image.naturalWidth)); ctx.fillStyle = pattern; ctx.fillRect(0, 0, width, height) }
  }
  ctx.restore()
}
/** Original, programmatically drawn seamless tiles, distributed with the app. */
export function createBackgroundTile(kind: 'paper' | 'grid' | 'dots'): string {
  const tile = document.createElement('canvas'); tile.width = tile.height = 128
  const ctx = tile.getContext('2d'); if (!ctx) throw new Error('无法创建背景纹理。')
  ctx.fillStyle = kind === 'paper' ? '#fcf9f1' : '#ffffff'; ctx.fillRect(0, 0, 128, 128)
  if (kind === 'paper') {
    ctx.fillStyle = 'rgba(165,145,110,.10)'
    for (let i = 0; i < 90; i++) { const x = (i * 47 + 13) % 128, y = (i * 71 + 9) % 128; ctx.fillRect(x, y, 1, 1) }
  } else if (kind === 'grid') {
    ctx.strokeStyle = '#e1e9e6'; ctx.lineWidth = 1
    for (let n = 0; n < 128; n += 32) { ctx.beginPath(); ctx.moveTo(n + .5, 0); ctx.lineTo(n + .5, 128); ctx.moveTo(0, n + .5); ctx.lineTo(128, n + .5); ctx.stroke() }
  } else {
    ctx.fillStyle = '#d9e1dc'
    for (let y = 16; y < 128; y += 32) for (let x = 16; x < 128; x += 32) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill() }
  }
  return tile.toDataURL('image/png')
}
