/** Geometry stays in canvas coordinates; explicit user boxes are never moved. */
export interface LayoutBox { x: number; y: number; w: number; h: number }
export interface LayoutItem { id: string; box: LayoutBox; fixed: boolean; kind: 'text' | 'shape' | 'image'; protectedRegion?: string; group?: string }
export interface LayoutIssue { first: string; second: string }
export interface LayoutResult { boxes: Record<string, LayoutBox>; issues: LayoutIssue[] }
const area = { x: 100, y: 190, right: 1820, bottom: 905 }
const gap = 12
const intersects = (a: LayoutBox, b: LayoutBox, padding = gap) => a.x < b.x+b.w+padding && a.x+a.w+padding > b.x && a.y < b.y+b.h+padding && a.y+a.h+padding > b.y
const inside = (b: LayoutBox) => b.x >= area.x && b.y >= area.y && b.x+b.w <= area.right && b.y+b.h <= area.bottom
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Deterministic placement: fixed first, then nearest clear position with bounded shrink. */
export function solveLayout(items: LayoutItem[], protectedAreas: { id: string; box: LayoutBox }[] = []): LayoutResult {
  const boxes: Record<string, LayoutBox> = {}, issues: LayoutIssue[] = [], placed: LayoutItem[] = []
  const ordered = [...items.filter(i => i.fixed), ...items.filter(i => !i.fixed)]
  for (const item of ordered) {
    const obstacles = [...placed.map(i => ({ id: i.id, box: boxes[i.id] })), ...protectedAreas.filter(p => p.id !== item.protectedRegion)]
    if (item.fixed) {
      boxes[item.id] = { ...item.box }
      for (const other of obstacles) if (intersects(item.box, other.box, 0)) issues.push({ first: item.id, second: other.id })
      placed.push(item); continue
    }
    let best: LayoutBox | undefined, bestScore = Infinity
    for (const scale of [1, .9, .8, .7, .6]) {
      const w = item.box.w * scale, h = item.box.h * scale
      if ((item.kind === 'image' && Math.min(w,h) < 70) || (item.kind !== 'image' && h < 20)) continue
      const initialX = clamp(item.box.x + (item.box.w-w)/2,area.x,area.right-w), initialY = clamp(item.box.y + (item.box.h-h)/2,area.y,area.bottom-h)
      const xs = [initialX,area.x,area.right-w], ys = [initialY,area.y,area.bottom-h]
      for (const obstacle of obstacles) {
        xs.push(obstacle.box.x-w-gap,obstacle.box.x+obstacle.box.w+gap)
        ys.push(obstacle.box.y-h-gap,obstacle.box.y+obstacle.box.h+gap)
      }
      for (let x=area.x;x+w<=area.right;x+=160) xs.push(x)
      for (let y=area.y;y+h<=area.bottom;y+=100) ys.push(y)
      for (const x of xs) for (const y of ys) {
        const candidate = { x, y, w, h }
        if (!inside(candidate) || obstacles.some(o => intersects(candidate,o.box))) continue
        const distance = Math.hypot((x+w/2)-(item.box.x+item.box.w/2),(y+h/2)-(item.box.y+item.box.h/2))
        const companions = placed.filter(other => item.group && other.group === item.group).map(other => boxes[other.id])
        const separation = companions.length ? Math.min(...companions.map(other => Math.hypot(Math.max(0, other.x-x-w, x-other.x-other.w), Math.max(0, other.y-y-h, y-other.y-other.h)))) : 0
        const score = distance + (1-scale)*900 + Math.max(0, separation - 100) * 0.35
        if (score < bestScore) { bestScore=score; best=candidate }
      }
      if (best && scale === 1 && bestScore < 40) break
    }
    if (!best) {
      // Preserve data and report the conflict; never silently hide an element.
      best = { ...item.box }
      const other = obstacles.find(o => intersects(best!,o.box,0))
      issues.push({ first:item.id, second:other?.id ?? '画面边界' })
    }
    boxes[item.id] = best; placed.push(item)
  }
  return { boxes, issues }
}
