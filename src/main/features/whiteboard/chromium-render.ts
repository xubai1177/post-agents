import { BrowserWindow, app, nativeImage } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { SceneLayout, StoryboardElement, StickerPosition } from '../../../shared/whiteboard'
import { compileScene, describeLayoutIssues } from './scene-compiler'
import type { ScenePreview } from '../../../shared/whiteboard'

interface Segment { scene: number; beat: number; start: number; duration: number; text: string }
interface Timeline { segments: Segment[]; frames: number }
interface RenderBeat { stickerPath?: string; placeholder?: boolean; elements: StoryboardElement[]; stickerCue?: number; stickerPosition?: StickerPosition; segments?: { text: string; audioPath: string }[] }
interface RenderScene { focus: string; layout: SceneLayout; beats: RenderBeat[]; relations?: import('../../../shared/whiteboard').StoryboardRelation[] }

/** Remove only fully transparent margins; never crop visible pixels or stretch the image. */
function trimTransparentMargins(image: Electron.NativeImage): Electron.NativeImage {
  const { width, height } = image.getSize(), pixels = image.toBitmap()
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] > 0) {
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
  }
  if (right < left) return image
  const margin = Math.ceil(Math.max(right - left + 1, bottom - top + 1) * 0.05)
  left = Math.max(0, left - margin); top = Math.max(0, top - margin)
  right = Math.min(width - 1, right + margin); bottom = Math.min(height - 1, bottom + margin)
  return image.crop({ x: left, y: top, width: right - left + 1, height: bottom - top + 1 })
}

/** Render a completed scene with the same sandboxed canvas used for export. */
export async function renderSceneStill(scene: RenderScene): Promise<ScenePreview> {
  const beats = await Promise.all(scene.beats.map(async (beat, index) => {
    if (beat.placeholder) {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240"><rect x="3" y="3" width="354" height="234" rx="18" fill="#f3f4f6" stroke="#9ca3af" stroke-width="3" stroke-dasharray="10 7"/><text x="180" y="130" text-anchor="middle" font-size="28" fill="#4b5563">图片待生成</text></svg>'
      return { elements: beat.elements, stickerCue: beat.stickerCue, stickerPosition: beat.stickerPosition, start: index * 10, duration: 10, image: { dataURL: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width: 360, height: 240 } }
    }
    if (!beat.stickerPath) return { elements: beat.elements, start: index * 10, duration: 10 }
    const image = nativeImage.createFromBuffer(await readFile(beat.stickerPath))
    if (image.isEmpty()) throw new Error('白板视频：贴纸图片无效。')
    const size = image.getSize(), scale = Math.min(380 / size.width, 380 / size.height, 1)
    const resized = image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: 'best' })
    const trimmed = trimTransparentMargins(resized), dimensions = trimmed.getSize()
    return { elements: beat.elements, stickerCue: beat.stickerCue, stickerPosition: beat.stickerPosition, start: index * 10, duration: 10, image: { dataURL: `data:image/png;base64,${trimmed.toPNG().toString('base64')}`, ...dimensions } }
  }))
  const window = new BrowserWindow({ show: false, width: 1920, height: 1080, useContentSize: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  try {
    await window.loadFile(rendererFile())
    const compiled = compileScene({ focus: scene.focus, layout: scene.layout, relations: scene.relations, beats })
    await loadCompiledScene(window, compiled, [])
    await seekFrame(window, beats.length * 10 - 0.01)
    const result = (await captureFrame(window)).toString('base64')
    if (!result.length || result.length > 24 * 1024 * 1024) throw new Error('白板视频：预览生成失败。')
    return { image: `data:image/png;base64,${result}`, warnings: describeLayoutIssues(compiled.layoutIssues) }
  } finally { if (!window.isDestroyed()) window.destroy() }
}

/** Render only application-owned canvas code in a sandbox; the model supplies data, never code. */
export async function renderChromium(child: ChildProcessWithoutNullStreams, scenes: RenderScene[], timeline: Timeline, cancelled: () => boolean, onProgress?: (completed: number, total: number) => void): Promise<string[]> {
  child.stdin.on('error', () => {})
  if (cancelled()) throw new Error('白板视频：已取消生成。')
  const rendererScenes = await Promise.all(scenes.map(async (scene, si) => ({ focus: scene.focus, layout: scene.layout, relations: scene.relations, beats: await Promise.all(scene.beats.map(async (beat, bi) => {
    const segments = timeline.segments.filter(s => s.scene === si && s.beat === bi)
    if (!segments.length) throw new Error('白板视频：节拍缺少语音。')
    if (!beat.stickerPath) return { elements: beat.elements, start: segments[0].start, duration: segments.reduce((sum, s) => sum + s.duration, 0), cues: segments.map(s => s.start) }
    const image = nativeImage.createFromBuffer(await readFile(beat.stickerPath))
    if (image.isEmpty()) throw new Error('白板视频：贴纸图片无效。')
    const size = image.getSize(), scale = Math.min(380 / size.width, 380 / size.height, 1)
    const trimmed = trimTransparentMargins(image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: 'best' })), dimensions = trimmed.getSize()
    return { elements: beat.elements, stickerCue: beat.stickerCue, stickerPosition: beat.stickerPosition, start: segments[0].start, duration: segments.reduce((sum, s) => sum + s.duration, 0), cues: segments.map(s => s.start), image: { dataURL: `data:image/png;base64,${trimmed.toPNG().toString('base64')}`, ...dimensions } }
  })) })))
  const window = new BrowserWindow({ show: false, width: 1920, height: 1080, useContentSize: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  try {
    await window.loadFile(rendererFile())
    const compiledScenes = rendererScenes.map(scene => compileScene(scene))
    const warnings = compiledScenes.flatMap((scene,index) => describeLayoutIssues(scene.layoutIssues).map(message => `场景 ${index+1}：${message}`))
    let currentScene = -1, lastProgressAt = 0
    onProgress?.(0, timeline.frames)
    for (let frame = 0; frame < timeline.frames; frame++) {
      if (cancelled() || window.isDestroyed()) throw new Error('白板视频：已取消生成。')
      const time = frame / 30
      const segment = [...timeline.segments].reverse().find(item => item.start <= time) ?? timeline.segments[0]
      if (segment.scene !== currentScene) {
        currentScene = segment.scene
        const compiled = compiledScenes[currentScene]
        const captions = timeline.segments.filter(item => item.scene === currentScene).map(item => ({ start: item.start, end: item.start + item.duration, text: item.text }))
        await loadCompiledScene(window, compiled, captions)
      }
      await seekFrame(window, time)
      const bytes = await captureFrame(window)
      if (!bytes.length || bytes.length > 16 * 1024 * 1024) throw new Error('白板视频：画面数据无效。')
      if (!child.stdin.write(bytes)) await new Promise<void>((resolve, reject) => {
        const done = () => { cleanup(); resolve() }
        const failed = () => { cleanup(); reject(new Error('白板视频：编码器提前退出。')) }
        const cleanup = () => { child.stdin.off('drain', done); child.off('close', failed); child.stdin.off('error', failed) }
        child.stdin.once('drain', done); child.once('close', failed); child.stdin.once('error', failed)
      })
      const now = Date.now()
      if (frame + 1 === timeline.frames || now - lastProgressAt >= 500) { onProgress?.(frame + 1, timeline.frames); lastProgressAt = now }
      await new Promise<void>(resolve => setImmediate(resolve))
    }
    child.stdin.end()
    return warnings
  } finally { if (!window.isDestroyed()) window.destroy() }
}

function rendererFile(): string { return app.isPackaged ? join(process.resourcesPath, 'whiteboard-svg-render.html') : join(app.getAppPath(), 'scripts', 'whiteboard-svg-render.html') }
async function loadCompiledScene(window: BrowserWindow, scene: ReturnType<typeof compileScene>, captions: { start: number; end: number; text: string }[]): Promise<void> {
  const payload = Buffer.from(JSON.stringify({ ...scene, captions })).toString('base64')
  await window.webContents.executeJavaScript(`(async()=>{const d=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(${JSON.stringify(payload)}),c=>c.charCodeAt(0))));await document.fonts.ready;window.loadScene(d.elements,d.beatOf,d.beats,d.files,d.beats.at(-1)[1],d.cues,d.cueOf);window.setCaptions(d.captions,{fontSize:40,baselineY:1022});await window.imagesReady()})()` )
}

async function seekFrame(window: BrowserWindow, time: number): Promise<void> { await window.webContents.executeJavaScript(`(async()=>{window.seek(${time});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})()`) }

async function captureFrame(window: BrowserWindow): Promise<Buffer> { const image = await window.webContents.capturePage(); const size = image.getSize(); return (size.width === 1920 && size.height === 1080 ? image : image.resize({ width: 1920, height: 1080, quality: 'best' })).toPNG() }
