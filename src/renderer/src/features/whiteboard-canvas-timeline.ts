/** Layer order stays in the source array; drawOrder only affects the animation. */
export interface TimedCanvasItem { id: string; duration: number; drawOrder?: number; wait?: number }
export interface CanvasTiming<T extends TimedCanvasItem> { item: T; start: number; end: number; wait: number; previousEnd: number }
export function canvasTimeline<T extends TimedCanvasItem>(items: T[]): CanvasTiming<T>[] {
  const ordered = items.map((item, index) => ({ item, index })).sort((a, b) => (a.item.drawOrder ?? a.index) - (b.item.drawOrder ?? b.index) || a.index - b.index)
  let end = 0
  return ordered.map(({ item }, index) => {
    const wait = item.wait ?? (index === 0 ? .3 : .45), previousEnd = end, start = previousEnd + wait
    end = start + item.duration
    return { item, start, end, wait, previousEnd }
  })
}
export function moveCanvasDrawOrder<T extends TimedCanvasItem>(items: T[], id: string, delta: -1 | 1): T[] {
  const ordered = canvasTimeline(items).map(({ item }) => item.id), index = ordered.indexOf(id), target = index + delta
  if (index < 0 || target < 0 || target >= ordered.length) return items
  ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
  const ranks = new Map(ordered.map((key, rank) => [key, rank]))
  return items.map(item => ({ ...item, drawOrder: ranks.get(item.id) }))
}
/** Reorder layers without changing the animation order or legacy default waits. */
export function moveCanvasLayer<T extends TimedCanvasItem>(items: T[], id: string, delta: -1 | 1): T[] {
  const index = items.findIndex(item => item.id === id), target = index + delta
  if (index < 0 || target < 0 || target >= items.length) return items
  const next = items.map((item, position) => ({ ...item, drawOrder: item.drawOrder ?? position, wait: item.wait ?? (position === 0 ? .3 : .45) }))
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
/** Progress through the final portion of a wait, leaving the pen stationary before it moves. */
export function penTravelProgress(time: number, previousEnd: number, start: number): number {
  const travel = Math.min(.45, start - previousEnd)
  return travel <= 0 ? 1 : Math.max(0, Math.min(1, (time - (start - travel)) / travel))
}
