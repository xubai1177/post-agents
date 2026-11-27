const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function isCanvasWindowRoute(hash: string): boolean {
  return hash.replace(/^#/, '').split('?', 1)[0] === 'whiteboard-canvas'
}
export function canvasProjectFromRoute(hash: string): string | null {
  if (!isCanvasWindowRoute(hash)) return null
  const query = hash.replace(/^#/, '').split('?', 2)[1] ?? ''
  const id = new URLSearchParams(query).get('project')
  return id && projectIdPattern.test(id) ? id : null
}
export function canvasProjectRoute(id: string | null): string {
  return id && projectIdPattern.test(id) ? `#whiteboard-canvas?${new URLSearchParams({ project: id })}` : '#whiteboard-canvas'
}
