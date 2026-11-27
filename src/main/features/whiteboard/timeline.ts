export interface Caption { text: string; startMs: number; endMs: number }
/** Uses measured audio duration for every spoken segment, never estimated character timing. */
export function captionTimeline(segments: { text: string; durationMs: number }[]): Caption[] {
  let endMs = 0
  return segments.map(({ text, durationMs }) => {
    if (!text.trim() || /[\r\n\u0000-\u0008]/.test(text) || !Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > 600000) throw new Error('字幕片段或音频时长无效。')
    const startMs = endMs
    endMs += durationMs
    if (!Number.isSafeInteger(endMs)) throw new Error('音频时长无效。')
    return { text: text.trim(), startMs, endMs }
  })
}
export function subtitlesSrt(captions: Caption[]): string {
  const time = (value: number): string => {
    const ms = value % 1000, sec = Math.floor(value / 1000) % 60, min = Math.floor(value / 60000) % 60, hour = Math.floor(value / 3600000)
    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`
  }
  return captions.map((item, index) => `${index + 1}\n${time(item.startMs)} --> ${time(item.endMs)}\n${item.text}\n`).join('\n')
}

export { splitNarration } from '../../../shared/whiteboard-narration'
