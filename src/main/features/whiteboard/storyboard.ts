import type { Storyboard, StoryboardBeat, StoryboardScene, StoryboardElement, StoryboardRelation, ElementRef } from '../../../shared/whiteboard'
import { splitNarration } from '../../../shared/whiteboard-narration'

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('分镜格式无效。')
  return value as Record<string, unknown>
}
function field(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label}为空、过长或包含无效字符。`)
  return value.trim()
}
function validateBeat(input: unknown): StoryboardBeat {
  const beat = record(input)
  const narration = field(beat.narration, 180, '旁白')
  const cueCount = splitNarration(narration).length
  const cue = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= cueCount) throw new Error('画面出现时间对应的旁白片段无效，请重新选择。')
    return value
  }
  if (!Array.isArray(beat.elements) || beat.elements.length < 1 || beat.elements.length > 8) throw new Error('每个节拍需要 1 至 8 个绘制元素。')
  const elements = beat.elements.map((value): StoryboardElement => {
    const item = record(value)
    if (item.type !== 'text' && item.type !== 'arrow' && item.type !== 'box' && item.type !== 'circle') throw new Error('不支持的绘制元素。')
    const element: StoryboardElement = { type: item.type, text: field(item.text, 24, '绘制元素') }
    if (item.cue !== undefined) element.cue = cue(item.cue)
    if (item.emphasis !== undefined) {
      if (item.type !== 'text' || (item.emphasis !== 'highlight' && item.emphasis !== 'circle' && item.emphasis !== 'underline')) throw new Error('文字强调样式无效。')
      element.emphasis = item.emphasis
    }
    if (item.color !== undefined) {
      if (item.color !== 'ink' && item.color !== 'green' && item.color !== 'blue' && item.color !== 'red' && item.color !== 'orange') throw new Error('绘制颜色无效。')
      element.color = item.color
    }
    const bounds = [item.x, item.y, item.width, item.height]
    if (bounds.some(value => value !== undefined)) {
      if (!bounds.every(value => typeof value === 'number' && Number.isFinite(value)) || typeof item.x !== 'number' || typeof item.y !== 'number' || typeof item.width !== 'number' || typeof item.height !== 'number' || item.x < 0 || item.y < 0 || item.width < 5 || item.height < 3 || item.x + item.width > 100 || item.y + item.height > 100) throw new Error('绘制元素位置或尺寸无效。')
      Object.assign(element, { x: item.x, y: item.y, width: item.width, height: item.height })
    }
    return element
  })
  const sticker = beat.sticker === '' ? '' : field(beat.sticker, 300, '贴纸描述')
  const result: StoryboardBeat = { narration, sticker, elements }
  if (!sticker && (beat.stickerCue !== undefined || beat.stickerPosition !== undefined)) throw new Error('未使用贴纸时不能设置贴纸位置或出现时间。')
  if (beat.stickerCue !== undefined) result.stickerCue = cue(beat.stickerCue)
  if (beat.stickerPosition !== undefined) {
    const p = record(beat.stickerPosition), { x, y, width, height } = p
    if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number' || ![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width < 5 || height < 5 || x + width > 100 || y + height > 100) throw new Error('贴纸位置或尺寸无效。')
    result.stickerPosition = { x, y, width, height }
  }
  return result
}
export function validateStoryboard(input: unknown): Storyboard {
  const plan = record(input), title = field(plan.title, 40, '视频标题')
  if (!Array.isArray(plan.scenes) || plan.scenes.length < 3 || plan.scenes.length > 8) throw new Error('分镜需要 3 至 8 个场景。')
  const scenes = plan.scenes.map((value): StoryboardScene => {
    const scene = record(value), focus = field(scene.focus, 25, '画面重点')
    // Read older saved projects without altering their original data until a save is requested.
    if (scene.beats === undefined) {
      if (!Array.isArray(scene.elements) || scene.elements.length < 1 || scene.elements.length > 5) throw new Error('旧分镜元素无效。')
      const elements = scene.elements.map((value): StoryboardElement => { const item = record(value); if (item.type !== 'text' && item.type !== 'arrow' && item.type !== 'box' && item.type !== 'circle') throw new Error('不支持的绘制元素。'); return { type: item.type, text: field(item.text, 24, '绘制元素') } })
      return { focus, layout: 'list', beats: [{ narration: field(scene.narration, 180, '旁白'), sticker: field(scene.sticker, 300, '贴纸描述'), elements }] }
    }
    if (scene.layout !== 'list' && scene.layout !== 'columns' && scene.layout !== 'steps' && scene.layout !== 'diagram' && scene.layout !== 'concentric' && scene.layout !== 'spotlight') throw new Error('不支持的场景布局。')
    if (!Array.isArray(scene.beats) || scene.beats.length < 1 || scene.beats.length > 4) throw new Error('每个场景需要 1 至 4 个讲解节拍。')
    const beats = scene.beats.map(validateBeat)
    if (scene.layout === 'spotlight' && (beats.length > 3 || beats.some(beat => beat.elements.length > 2))) throw new Error('重点结论布局最多 3 个节拍，每个节拍最多 2 个元素。')
    if (scene.layout === 'concentric' && (beats.length < 2 || beats.length > 3 || beats.some(beat => beat.elements.length > 3))) throw new Error('同心区域需要 2 至 3 个节拍，每个节拍最多 3 个元素。')
    if (scene.layout === 'diagram' && beats.reduce((sum, beat) => sum + beat.elements.length, 0) > 12) throw new Error('关系图最多支持 12 个画面元素，请拆分场景。')
    const result: StoryboardScene = { focus, layout: scene.layout, beats }
    if (scene.relations !== undefined) {
      if (!Array.isArray(scene.relations) || scene.relations.length > 20) throw new Error('场景关系不能超过 20 条。')
      const seen = new Set<string>()
      const ref = (input: unknown): ElementRef => {
        const point = record(input)
        if (typeof point.beat !== 'number' || !Number.isInteger(point.beat) || point.beat < 0 || point.beat >= beats.length || typeof point.element !== 'number' || !Number.isInteger(point.element) || point.element < 0 || point.element >= beats[point.beat].elements.length) throw new Error('关系连线的元素不存在。')
        return { beat: point.beat, element: point.element }
      }
      result.relations = scene.relations.map((input): StoryboardRelation => {
        const value = record(input), from = ref(value.from), to = ref(value.to)
        if (from.beat === to.beat && from.element === to.element) throw new Error('关系连线不能指向自身。')
        const a = beats[from.beat].elements[from.element], b = beats[to.beat].elements[to.element]
        if (a.x !== undefined && a.y !== undefined && a.width !== undefined && a.height !== undefined && b.x !== undefined && b.y !== undefined && b.width !== undefined && b.height !== undefined && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) throw new Error('关系连线的节点重叠，请调整位置。')
        const key = `${from.beat}:${from.element}-${to.beat}:${to.element}`
        if (seen.has(key)) throw new Error('关系连线重复。')
        seen.add(key)
        const relation: StoryboardRelation = { from, to }
        if (value.label !== undefined && value.label !== '') relation.label = field(value.label, 24, '连线文字')
        if (value.color !== undefined) {
          if (value.color !== 'ink' && value.color !== 'green' && value.color !== 'blue' && value.color !== 'red' && value.color !== 'orange') throw new Error('连线颜色无效。')
          relation.color = value.color
        }
        if (value.style !== undefined) {
          if (value.style !== 'solid' && value.style !== 'dashed') throw new Error('连线样式无效。')
          relation.style = value.style
        }
        return relation
      })
    }
    return result
  })
  return { title, scenes }
}
export function parseStoryboard(raw: string): Storyboard {
  if (raw.length > 50000) throw new Error('分镜数据过长。')
  let value: unknown
  try { value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) } catch { throw new Error('模型未返回有效的分镜数据。') }
  const plan = validateStoryboard(value)
  if (plan.scenes.some(scene => scene.beats.length < 2 || scene.beats.some(beat => beat.elements.length > 8 || beat.narration.length > 120))) throw new Error('模型返回的节拍数量或长度无效。')
  return plan
}
