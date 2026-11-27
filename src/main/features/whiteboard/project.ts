import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderChromium, renderSceneStill } from './chromium-render'
import { prepareAudioTimeline } from './audio-timeline'
import { removeWhiteBorder } from './sticker-background'
import { splitNarration } from './timeline'
import { nativeImage } from 'electron'
import { requestImageWithUsage } from '../../infrastructure/image-provider'
import { getImageSettings } from '../settings/settings'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { VideoProject, VideoUsage } from '../../../shared/whiteboard'
import { getRuntimeSettings } from '../settings/settings'
import { parseStoryboard, validateStoryboard } from './storyboard'
import { synthesizeVolcengine } from './volcengine-voice'
import { resolveVoiceConfig } from './voice-config'
import { synthesizeLocalVoice } from './local-voice'

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const renderIdPattern = /^render-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const active = new Set<string>()
const voiceRequests = new Map<string, AbortController>()
async function folder(root: string, id?: string): Promise<string> {
  if (!root) throw new Error('白板视频：请先打开工作区。')
  const base = join(root, '白板视频工程')
  await mkdir(base, { recursive: true })
  const baseStat = await lstat(base)
  if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) throw new Error('白板视频：工程目录无效。')
  if (!id) return base
  if (!idPattern.test(id)) throw new Error('白板视频：工程编号无效。')
  const path = join(base, id)
  const stat = await lstat(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('白板视频：工程目录无效。')
  return path
}
async function load(root: string, id: string): Promise<VideoProject> {
  const path = join(await folder(root, id), 'project.json')
  const stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 200000) throw new Error('白板视频：工程文件无效。')
  const project = JSON.parse(await readFile(path, 'utf8')) as VideoProject
  if (project.id !== id || typeof project.topic !== 'string' || !Array.isArray(project.usage)) throw new Error('白板视频：工程数据无效。')
  project.imageUsage ??= []; project.stickers ??= []
  if (project.videos === undefined) project.videos = project.lastVideo && renderIdPattern.test(project.lastVideo) ? [{ id: project.lastVideo, title: project.plan?.title || project.topic.slice(0, 40), createdAt: null }] : []
  if (!Array.isArray(project.videos) || project.videos.some(item => !item || typeof item.id !== 'string' || !renderIdPattern.test(item.id) || typeof item.title !== 'string' || item.title.length > 100 || !(item.createdAt === null || (typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt)))))) throw new Error('白板视频：视频记录无效。')
  if (!active.has(id)) {
    for (const usage of [...project.usage, ...project.imageUsage]) if (usage.status === '进行中') usage.status = '中断'
  }
  if (!active.has(id) && project.renderStatus === '进行中') project.renderStatus = '中断'
  if (project.plan) project.plan = validateStoryboard(project.plan)
  return project
}
async function save(root: string, project: VideoProject): Promise<void> {
  const dir = await folder(root, project.id)
  project.updatedAt = new Date().toISOString()
  const temp = join(dir, `${randomUUID()}.tmp`)
  await writeFile(temp, JSON.stringify(project, null, 2), { flag: 'wx', mode: 0o600 })
  await rename(temp, join(dir, 'project.json'))
}
export async function listProjects(root: string): Promise<VideoProject[]> {
  if (!root) return []
  const base = await folder(root)
  const projects = await Promise.all((await readdir(base)).filter(id => idPattern.test(id)).map(async id => { try { return await load(root, id) } catch { return null } }))
  return projects.filter((p): p is VideoProject => p !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
export async function createProject(root: string, topic: string): Promise<VideoProject> {
  if (typeof topic !== 'string' || !topic.trim() || topic.length > 25000 || /[\u0000-\u0008]/.test(topic)) throw new Error('白板视频：请输入不超过 25000 字的主题或文章内容。')
  const base = await folder(root), id = randomUUID()
  await mkdir(join(base, id), { mode: 0o700 })
  const project: VideoProject = { id, topic: topic.trim(), plan: null, usage: [], imageUsage: [], stickers: [], error: null, updatedAt: '' }
  await save(root, project)
  return project
}
export async function updatePlan(root: string, id: string, input: unknown): Promise<VideoProject> {
  if (active.has(id)) throw new Error('白板视频：工程正在处理。')
  active.add(id)
  try {
    const project = await load(root, id)
    project.plan = validateStoryboard(input)
    project.stickers = project.stickers.filter(item => item.scene >= 0 && item.scene < project.plan!.scenes.length && (item.beat ?? 0) >= 0 && (item.beat ?? 0) < project.plan!.scenes[item.scene].beats.length)
    project.error = null
    await save(root, project)
    return project
  } finally { active.delete(id) }
}
function count(value: unknown): number | null { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null }
export async function generatePlan(root: string, id: string, settings: typeof getRuntimeSettings = getRuntimeSettings): Promise<VideoProject> {
  if (active.has(id)) throw new Error('白板视频：工程正在生成分镜。')
  active.add(id)
  try {
    const config = await settings()
    if (root !== config.draftsDirectory || !config.apiKey || !config.model || !config.apiUrl) throw new Error('白板视频：请先配置文案模型并确认工作区。')
    const project = await load(root, id)
    const usage: VideoUsage = { model: config.model, stage: '分镜', status: '进行中', inputTokens: null, outputTokens: null, totalTokens: null }
    project.usage.push(usage); project.error = null
    await save(root, project)
    try {
      const model = new ChatOpenAI({ model: config.model, apiKey: config.apiKey, configuration: { baseURL: config.apiUrl }, maxRetries: 0, timeout: 120000, streamUsage: false })
      const response = await model.invoke([new SystemMessage('你是白板讲解视频编导。先分析每段讲解中的包含、因果、对比、流程、层级或结论关系，再依据关系选择图解，构思开场、解释、例子和结论。只返回 JSON 数据，不要代码。格式 {"title":"标题","scenes":[{"focus":"场景标题","layout":"list|columns|steps|diagram|concentric|spotlight","beats":[{"narration":"口语旁白","sticker":"单个可辨认的物件或人物贴纸描述","elements":[{"type":"text|arrow|box|circle","text":"简短文字","color":"ink|green|blue|red|orange","emphasis":"highlight|circle|underline（可选，仅 text）"}]}]}]}。生成3至8个场景，每场景2至4个节拍，每节拍1至5个元素；按讲解意义选择列表、左右对照、流程步骤、关系图 diagram、同心区域 concentric 或通栏结论 spotlight。spotlight 适合一个核心结论及补充：1至3个节拍，每节拍1至2个简短文字，结论置中、贴纸在下方；避免所有场景采用左右分栏。包含和内外区域关系优先使用 concentric：2至3个节拍从内到外排列，每节拍首个元素是区域名称，其余最多2个元素是该区域说明；不要用并列卡片表达包含。因果和层级使用关系图及箭头，流程使用步骤，重要结论使用简短醒目的文字。每个节拍的元素应随对应旁白逐步出现，文字短而具体。关系图场景可添加 relations 数组，每条为 {"from":{"beat":0,"element":0},"to":{"beat":1,"element":0},"label":"导致","color":"green","style":"solid"}；beat 和 element 是从0开始的索引，必须指向本场景存在的两个不同元素，最多20条。关系图优先使用框或圆形作为节点，整屏建议3至8个节点，默认采用自动布局；仅在确有因果、依赖或对比时添加连线。可为元素同时提供 x,y,width,height 四个数字，范围为0到100，表示画布内容区的百分比，确保 x+width 和 y+height 不超过100，避免重叠；不确定则省略全部坐标，采用自动布局。贴纸位置 stickerPosition 可省略，默认自动排布；仅当需要打破自动布局时提供 x、y、width、height 四个百分比，范围 0 至 100，x+width 和 y+height 不超过 100，避免与文字及其他贴纸重叠。旁白每节拍最多120字，元素文字最多24字，贴纸描述最多300字。事实不确定时明确说明，不虚构来源。' + ' 先写旁白，再按标点把每个节拍分为顺序片段，每个片段最多24字。每个元素增加 cue，贴纸增加 stickerCue，均为从0开始的片段序号，表示讲到该片段时开始出现；不得超出片段数量。例如旁白“想早睡，可继续刷手机。”分为0“想早睡，”和1“可继续刷手机。”，手机贴纸 stickerCue 为1。画面只表现对应片段内容，避免提前展示结论；元素和贴纸表达同一动作或关系，贴纸描述须写出动作和状态而不是只写泛泛物件。每个场景保持清晰主视觉和关联图组，避免装饰性堆叠；steps 会用箭头连接节拍，只能用于存在先后步骤的同一流程，不得用于并列例子或不同建议，并列例子用 list 或 columns；仅在人物或物件有必要时提供贴纸描述，否则 sticker 为无内容的空字符串且不要提供 stickerCue。'), new HumanMessage(project.topic)])
      usage.inputTokens = count(response.usage_metadata?.input_tokens); usage.outputTokens = count(response.usage_metadata?.output_tokens); usage.totalTokens = count(response.usage_metadata?.total_tokens)
      project.plan = parseStoryboard(response.text); usage.status = '成功'
    } catch { usage.status = '失败'; project.error = '分镜生成失败，请检查模型服务或重试。已发生的用量可能未提供。' }
    await save(root, project)
    return project
  } finally { active.delete(id) }
}
export async function projectDirectory(root: string, id: string): Promise<string> { await load(root, id); return folder(root, id) }

function sceneIndex(project: VideoProject, scene: number, beat: number): void {
  if (!Number.isInteger(scene) || scene < 0 || !project.plan || scene >= project.plan.scenes.length || !Number.isInteger(beat) || beat < 0 || beat >= project.plan.scenes[scene].beats.length) throw new Error('白板视频：场景无效。')
}
function safeUsage(input: unknown): { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; images: number | null; extraUnits: Record<string, number> } {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const extraUnits: Record<string, number> = {}
  for (const [key, unit] of Object.entries(value).slice(0, 30)) if (!['input_tokens', 'output_tokens', 'total_tokens', 'images'].includes(key) && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) && typeof unit === 'number' && Number.isFinite(unit) && unit >= 0) extraUnits[key] = unit
  return { inputTokens: count(value.input_tokens), outputTokens: count(value.output_tokens), totalTokens: count(value.total_tokens), images: count(value.images), extraUnits }
}
async function storeSticker(root: string, project: VideoProject, scene: number, beat: number, bytes: Buffer, removeBackground = false): Promise<void> {
  if (bytes.length > 15 * 1024 * 1024) throw new Error('白板视频：图片过大。')
  const image = nativeImage.createFromBuffer(bytes)
  const size = image.getSize()
  if (image.isEmpty() || size.width > 4096 || size.height > 4096 || size.width * size.height > 16000000) throw new Error('白板视频：图片格式或尺寸无效。')
  const filename = `sticker-${randomUUID()}.png`
  const dir = await folder(root, project.id)
  const bitmap = removeBackground ? removeWhiteBorder(image.toBitmap(), size.width, size.height) : null
  if (bitmap) {
    await writeFile(join(dir, `original-${filename}`), image.toPNG(), { flag: 'wx', mode: 0o600 })
    const transparent = nativeImage.createFromBitmap(bitmap, { width: size.width, height: size.height })
    await writeFile(join(dir, filename), transparent.toPNG(), { flag: 'wx', mode: 0o600 })
  } else await writeFile(join(dir, filename), image.toPNG(), { flag: 'wx', mode: 0o600 })
  project.stickers = [...project.stickers.filter(item => item.scene !== scene || (item.beat ?? 0) !== beat), { scene, beat, description: project.plan!.scenes[scene].beats[beat].sticker, filename }]
}
export interface StickerDependencies { settings: typeof getImageSettings; request: typeof requestImageWithUsage }
const stickerDependencies: StickerDependencies = { settings: getImageSettings, request: requestImageWithUsage }
async function generateStickerUnlocked(root: string, id: string, scene: number, beat: number, deps: StickerDependencies = stickerDependencies): Promise<VideoProject> {
    const config = await deps.settings()
    if (config.draftsDirectory !== root || !config.apiUrl || !config.apiKey || !config.model) throw new Error('白板视频：请先配置图片模型。')
    const project = await load(root, id); sceneIndex(project, scene, beat)
    if (!project.plan!.scenes[scene].beats[beat].sticker) throw new Error('白板视频：该节拍未使用贴纸。')
    const usage = { model: config.model, scene, beat, status: '进行中' as '进行中' | '成功' | '失败' | '中断', inputTokens: null as number | null, outputTokens: null as number | null, totalTokens: null as number | null, images: null as number | null }
    project.imageUsage.push(usage); project.error = null; await save(root, project)
    try {
      const result = await deps.request(config, `白板讲解视频用卡通插画贴纸：${project.plan!.scenes[scene].beats[beat].sticker}。手绘黑色线条，少量柔和蓝色和黄色，单个主体居中，纯白背景，不要文字、边框、水印。`, value => Object.assign(usage, safeUsage(value)))
      Object.assign(usage, safeUsage(result.usage))
      await storeSticker(root, project, scene, beat, result.bytes, true); usage.status = '成功'
    } catch { usage.status = '失败'; project.error = `场景 ${scene + 1} 的节拍 ${beat + 1} 贴纸生成或保存失败，可重试；用量可能未提供。` }
    await save(root, project); return project
}
export async function generateSticker(root: string, id: string, scene: number, beat: number): Promise<VideoProject> {
  if (active.has(id)) throw new Error('白板视频：工程正在处理，请稍候。')
  active.add(id)
  try { return await generateStickerUnlocked(root, id, scene, beat) } finally { active.delete(id) }
}
export async function generateMissingStickers(root: string, id: string, deps: StickerDependencies = stickerDependencies): Promise<VideoProject> {
  if (active.has(id)) throw new Error('白板视频：工程正在处理，请稍候。')
  active.add(id)
  try {
    let project = await load(root, id)
    if (!project.plan) throw new Error('白板视频：请先保存分镜。')
    const targets = project.plan.scenes.flatMap((scene, sceneIndex) => scene.beats.flatMap((beat, beatIndex) => beat.sticker ? [{ sceneIndex, beatIndex }] : []))
    const failures: string[] = []
    for (const { sceneIndex, beatIndex } of targets) {
      const sticker = project.stickers.find(item => item.scene === sceneIndex && (item.beat ?? 0) === beatIndex && item.description === project.plan!.scenes[sceneIndex].beats[beatIndex].sticker)
      if (sticker) { try { if (await stickerData(root, id, sceneIndex, beatIndex)) continue } catch { /* missing file is regenerated */ } }
      project = await generateStickerUnlocked(root, id, sceneIndex, beatIndex, deps)
      if (project.error) failures.push(`${sceneIndex + 1}-${beatIndex + 1}`)
    }
    project.error = failures.length ? `场景-节拍 ${failures.join('、')} 的贴纸生成失败，可单独重试；已成功素材已保留。` : null
    await save(root, project)
    return project
  } finally { active.delete(id) }
}

export async function replaceSticker(root: string, id: string, scene: number, beat: number, bytes: Buffer): Promise<VideoProject> {
  if (active.has(id)) throw new Error('白板视频：工程正在处理，请稍候。')
  active.add(id)
  try { const project = await load(root, id); sceneIndex(project, scene, beat); await storeSticker(root, project, scene, beat, bytes); await save(root, project); return project } finally { active.delete(id) }
}
export async function stickerData(root: string, id: string, scene: number, beat: number): Promise<string | null> {
  const project = await load(root, id); sceneIndex(project, scene, beat)
  const item = project.stickers.find(value => value.scene === scene && (value.beat ?? 0) === beat)
  if (!item || !/^sticker-[0-9a-f-]{36}\.png$/.test(item.filename)) return null
  const path = join(await folder(root, id), item.filename), stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 15 * 1024 * 1024) throw new Error('白板视频：贴纸文件无效。')
  return `data:image/png;base64,${(await readFile(path)).toString('base64')}`
}

export async function previewScene(root: string, id: string, scene: number, draft?: import('../../../shared/whiteboard').Storyboard): Promise<import('../../../shared/whiteboard').ScenePreview> {
  const project = await load(root, id)
  const plan = draft ? validateStoryboard(draft) : project.plan
  if (!plan || !Number.isInteger(scene) || scene < 0 || scene >= plan.scenes.length) throw new Error('白板视频：场景无效。')
  const selected = plan.scenes[scene], dir = await folder(root, id)
  const beats = await Promise.all(selected.beats.map(async (beat, index) => {
    if (!beat.sticker) return { elements: beat.elements }
    const item = project.stickers.find(value => value.scene === scene && (value.beat ?? 0) === index && value.description === beat.sticker)
    if (!item || !/^sticker-[0-9a-f-]{36}\.png$/.test(item.filename)) {
      if (!draft) throw new Error('白板视频：请先准备此场景全部贴纸。')
      return { placeholder: true, elements: beat.elements, stickerCue: beat.stickerCue, stickerPosition: beat.stickerPosition }
    }
    const stickerPath = join(dir, item.filename), info = await lstat(stickerPath)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 15 * 1024 * 1024) throw new Error('白板视频：贴纸文件无效。')
    return { stickerPath, elements: beat.elements, stickerCue: beat.stickerCue, stickerPosition: beat.stickerPosition }
  }))
  const result = await renderSceneStill({ focus: selected.focus, layout: selected.layout, relations: selected.relations, beats })
  if (beats.some(beat => 'placeholder' in beat && beat.placeholder)) result.warnings.unshift('部分图片尚未生成，预览中显示占位图。')
  return result
}

const processes = new Map<string, import('node:child_process').ChildProcess>()
const cancelledRenders = new Set<string>()
export function cancelRender(id: string): void {
  if (active.has(id)) cancelledRenders.add(id)
  voiceRequests.get(id)?.abort()
  const child = processes.get(id)
  if (child?.pid) { try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') } }
}
export function cancelAllRenders(): void { for (const id of new Set([...processes.keys(), ...voiceRequests.keys()])) cancelRender(id) }
export async function renderProject(root: string, id: string, options: unknown, progress: (value: import('../../../shared/whiteboard').RenderProgress) => void): Promise<VideoProject> {
  if (active.has(id)) throw new Error('白板视频：工程正在处理，请稍候。')
  active.add(id)
  try {
    if (cancelledRenders.has(id)) throw new Error('白板视频：已取消生成。')
    const project = await load(root, id)
    if (!project.plan) throw new Error('白板视频：请先保存分镜。')
    const dir = await folder(root, id)
    if (!options || typeof options !== 'object') throw new Error('白板视频：语音设置无效。')
    const voice = options as Record<string, unknown>
    if (voice.mode !== undefined && voice.mode !== 'cloud' && voice.mode !== 'local') throw new Error('白板视频：语音设置无效。')
    const local = voice.mode === 'local'
    if (typeof voice.speed !== 'number' || !Number.isFinite(voice.speed) || voice.speed < 0.6 || voice.speed > 1.6) throw new Error('白板视频：语音设置无效。')
    if (!local && (typeof voice.speaker !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(voice.speaker))) throw new Error('白板视频：语音设置无效。')
    const config = local ? null : await resolveVoiceConfig(voice.configId)
    const speaker = typeof voice.speaker === 'string' ? voice.speaker : '', speed = voice.speed
    const cache = join(dir, 'voice-cache'); await mkdir(cache, { recursive: true }); const cacheInfo = await lstat(cache)
    if (!cacheInfo.isDirectory() || cacheInfo.isSymbolicLink()) throw new Error('白板视频：语音缓存目录无效。')
    progress({ phase: 'voice' })
    const scenes = await Promise.all(project.plan.scenes.map(async (scene, sceneIndex) => {
      const beats = await Promise.all(scene.beats.map(async (beat, beatIndex) => {
        if (!beat.sticker) return { ...beat, stickerPath: undefined, elements: beat.elements }
        const item = project.stickers.find(sticker => sticker.scene === sceneIndex && (sticker.beat ?? 0) === beatIndex && sticker.description === beat.sticker)
        if (!item || !/^sticker-[0-9a-f-]{36}\.png$/.test(item.filename)) throw new Error(`白板视频：请先准备场景 ${sceneIndex + 1} 节拍 ${beatIndex + 1} 的贴纸。`)
        const stickerPath = join(dir, item.filename), info = await lstat(stickerPath)
        if (!info.isFile() || info.isSymbolicLink() || info.size > 15 * 1024 * 1024) throw new Error('白板视频：贴纸文件无效。')
        return { ...beat, stickerPath, elements: beat.elements }
      }))
      return { ...scene, beats }
    }))
    project.renderStatus = '进行中'; project.error = null; project.layoutWarnings = []; await save(root, project)
    try {
    const buildName = `render-${randomUUID()}`, buildDir = join(dir, buildName)
    await mkdir(buildDir, { mode: 0o700 })
    const items: { text: string; path: string }[] = []
    const voicedScenes = []
    for (const scene of scenes) {
      const voicedBeats = []
      for (const beat of scene.beats) {
      const segments = []
      for (const text of splitNarration(beat.narration)) {
        if (cancelledRenders.has(id)) throw new Error('白板视频：已取消生成。')
        const digest = createHash('sha256').update(JSON.stringify([config?.provider === 'agent-plan' ? 'agent-plan-seed-tts-2.0-pcm-v1' : config ? 'volcengine-seed-tts-2.0-pcm-v1' : 'macos-system-voice-v1', config?.cacheId, text, speaker, speed])).digest('hex')
        const audioPath = join(local ? buildDir : cache, `${digest}.wav`)
        let exists = false
        try { const info = await lstat(audioPath); if (!info.isFile() || info.isSymbolicLink() || info.size < 256 || info.size > 10 * 1024 * 1024) throw new Error('invalid cache'); exists = true } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('白板视频：语音缓存无效。') }
        if (!exists) {
          if (!items.some(item => item.path === audioPath)) items.push({ text, path: audioPath })
        }
        segments.push({ text, audioPath })
      }
      voicedBeats.push({ ...beat, segments })
      }
      voicedScenes.push({ ...scene, beats: voicedBeats })
    }
    const { app } = await import('electron')
    if (items.length) progress({ phase: 'voice', completed: 0, total: items.length })
    if (items.length) {
      const controller = new AbortController(); voiceRequests.set(id, controller)
      try {
        for (const [index, item] of items.entries()) {
          if (cancelledRenders.has(id)) throw new Error('白板视频：已取消生成。')
          const audio = config
            ? await synthesizeVolcengine(config.provider, item.text, speaker, speed, controller.signal, fetch, async () => config.key, config.url)
            : await synthesizeLocalVoice(item.text, speed, buildDir, controller.signal)
          const temp = `${item.path}.${randomUUID()}.tmp`
          try { await writeFile(temp, audio, { flag: 'wx', mode: 0o600 }); await rename(temp, item.path) } finally { const { rm } = await import('node:fs/promises'); await rm(temp, { force: true }) }
          progress({ phase: 'voice', completed: index + 1, total: items.length })
        }
      } finally { voiceRequests.delete(id) }
    }
    const timeline = await prepareAudioTimeline(voicedScenes, buildDir)
    const { spawn } = await import('node:child_process')
    const ffmpeg = app.isPackaged ? join(process.resourcesPath, 'ffmpeg') : join(app.getAppPath(), '.cache', 'ffmpeg', 'ffmpeg')
    if (cancelledRenders.has(id)) throw new Error('白板视频：已取消生成。')
    progress({ phase: 'render' })
    const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-vcodec', 'png', '-i', 'pipe:0', '-i', timeline.audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'h264_videotoolbox', '-allow_sw', '1', '-b:v', '5M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', '-y', join(buildDir, '视频.mp4')], { detached: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] }); processes.set(id, child)
    let diagnostics = ''
    child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk: string) => { diagnostics = (diagnostics + chunk).slice(-4000) })
    child.stdout.resume()
    const completion = new Promise<boolean>(resolve => { child.once('error', () => resolve(false)); child.once('close', code => resolve(code === 0)) })
    try {
      project.layoutWarnings = await renderChromium(child, voicedScenes, timeline, () => cancelledRenders.has(id), (completed, total) => progress({ phase: 'render', completed, total }))
      progress({ phase: 'export' })
    } catch (error) {
      child.kill('SIGTERM'); await completion; throw error
    }
    const completed = await completion
    processes.delete(id)
    if (!completed && diagnostics) console.error('白板视频 FFmpeg:', diagnostics)
    if (completed) { project.lastVideo = buildName; project.videos = [{ id: buildName, title: project.plan.title, createdAt: new Date().toISOString() }, ...(project.videos ?? [])]; project.renderStatus = '完成' } else { project.renderStatus = cancelledRenders.has(id) ? '中断' : '失败'; project.error = cancelledRenders.has(id) ? '已取消生成，工程和中间结果已保留。' : '视频生成失败，已保留工程和中间结果。请检查磁盘空间后重试。' }
    await save(root, project)
    return project
    } catch (error) {
      project.renderStatus = cancelledRenders.has(id) ? '中断' : '失败'
      project.error = cancelledRenders.has(id) ? '已取消生成，已成功的语音已保留。' : (error instanceof Error && (error.message.startsWith('白板视频：')) ? error.message : '语音或视频生成失败，请检查语音服务和磁盘空间。已成功的语音已保留。')
      await save(root, project); return project
    }
  } finally { processes.delete(id); cancelledRenders.delete(id); active.delete(id) }
}
export async function videoFile(root: string, id: string, videoId?: string): Promise<string> {
  const project = await load(root, id)
  const selected = videoId ?? project.lastVideo
  if (!selected || !renderIdPattern.test(selected) || !project.videos?.some(item => item.id === selected)) throw new Error('白板视频：没有可预览的视频。')
  const dir = join(await folder(root, id), selected), dirStat = await lstat(dir)
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error('白板视频：视频目录无效。')
  const file = join(dir, '视频.mp4'), fileStat = await lstat(file)
  if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size === 0) throw new Error('白板视频：视频文件无效。')
  return file
}
export async function deleteVideo(root: string, id: string, videoId: string, trash: (path: string) => Promise<void>): Promise<VideoProject> {
  if (active.has(id)) throw new Error('白板视频：工程正在处理，请稍候。')
  active.add(id)
  try {
    const project = await load(root, id)
    if (!renderIdPattern.test(videoId) || !project.videos?.some(item => item.id === videoId)) throw new Error('白板视频：视频记录不存在。')
    let path: string | undefined
    try { path = await videoFile(root, id, videoId) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    if (path) { try { await trash(path) } catch { throw new Error('白板视频：无法将视频移到废纸篓，请检查文件权限。') } }
    project.videos = project.videos.filter(item => item.id !== videoId)
    project.lastVideo = project.videos[0]?.id
    try { await save(root, project) } catch { throw new Error('白板视频：视频已移到废纸篓，但记录保存失败；请恢复视频后重试。') }
    return project
  } finally { active.delete(id) }
}
