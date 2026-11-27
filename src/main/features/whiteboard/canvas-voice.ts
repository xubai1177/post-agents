import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { canvasVoiceSnapshotSchema, type CanvasProjectData, type CanvasVoiceStatus } from '../../../shared/canvas-project'
import { splitNarration } from '../../../shared/whiteboard-narration'
import { loadCanvasProject, withCanvasProjectLock } from './canvas-project'
import { prepareAudioTimeline } from './audio-timeline'
import { resolveVoiceConfig } from './voice-config'
import { synthesizeLocalVoice } from './local-voice'
import { synthesizeVolcengine } from './volcengine-voice'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const running = new Set<string>()
type Config = Awaited<ReturnType<typeof resolveVoiceConfig>> | null
async function folder(root: string, projectId: string): Promise<string> {
  if (!uuid.test(projectId)) throw new Error('白板视频：工程编号无效。')
  const parent = join(root, '白板画布工程'), dir = join(parent, `${projectId}-voice`)
  for (const path of [parent, dir]) { await mkdir(path, { recursive: true }); const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('白板视频：配音目录无效。') }
  return dir
}
async function configFor(voice: CanvasProjectData['voice']): Promise<Config> { return voice.mode === 'local' ? null : resolveVoiceConfig(voice.configId) }
function signature(text: string, voice: CanvasProjectData['voice'], config: Config): string {
  return createHash('sha256').update(JSON.stringify([text, voice.mode, voice.speed, voice.mode === 'cloud' ? voice.speaker : '', config?.cacheId ?? '', config?.provider ?? ''])).digest('hex')
}
type RecordFile = { signature: string; audio: string; duration: number }
async function record(dir: string, id: string): Promise<RecordFile | null> {
  try {
    const path = join(dir, `${id}.json`), info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 2048) throw new Error('invalid')
    const data: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (!data || typeof data !== 'object' || !('signature' in data) || typeof data.signature !== 'string' || !/^[a-f0-9]{64}$/.test(data.signature) || !('audio' in data) || typeof data.audio !== 'string' || !/^[a-f0-9-]{36}\.wav$/i.test(data.audio) || !('duration' in data) || typeof data.duration !== 'number' || !Number.isFinite(data.duration) || data.duration <= 0) throw new Error('invalid')
    const audioInfo = await lstat(join(dir, data.audio)); if (!audioInfo.isFile() || audioInfo.isSymbolicLink() || audioInfo.size < 256 || audioInfo.size > 30_000_000) throw new Error('invalid')
    return { signature: data.signature, audio: data.audio, duration: data.duration }
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('白板视频：配音文件损坏，请重新生成。') }
}
export async function canvasVoiceStatuses(root: string, id: string, input: unknown): Promise<CanvasVoiceStatus[]> {
  const data = canvasVoiceSnapshotSchema.parse(input); await loadCanvasProject(root, id)
  const dir = await folder(root, id); let config: Config = null, unavailable = false
  try { config = await configFor(data.voice) } catch { unavailable = true }
  return Promise.all(data.panels.map(async panel => {
    if (!panel.narration.trim()) return { panelId: panel.id, state: 'empty' as const }
    let saved: RecordFile | null
    try { saved = await record(dir, panel.id) } catch { return { panelId: panel.id, state: 'missing' as const } }
    return { panelId: panel.id, state: !saved ? 'missing' as const : unavailable ? 'unavailable' as const : saved.signature === signature(panel.narration, data.voice, config) ? 'ready' as const : 'stale' as const }
  }))
}
export async function generateCanvasVoice(root: string, id: string, revision: string, panelId: string, localSynthesis: typeof synthesizeLocalVoice = synthesizeLocalVoice): Promise<void> {
  if (!uuid.test(panelId) || !/^[a-f0-9]{64}$/.test(revision)) throw new Error('白板视频：画布或工程版本无效。')
  const lock = `${root}:${id}`; if (running.has(lock)) throw new Error('白板视频：配音正在生成，请稍后重试。'); running.add(lock)
  let temp = ''
  try {
    const project = await loadCanvasProject(root, id); if (project.revision !== revision) throw new Error('白板视频：工程已在外部修改，请重新打开后再生成。')
    const panel = project.panels.find(item => item.id === panelId); if (!panel?.narration.trim()) throw new Error('白板视频：请先输入旁白。')
    const config = await configFor(project.voice), dir = await folder(root, id), digest = signature(panel.narration, project.voice, config)
    temp = join(dir, `build-${randomUUID()}`); await mkdir(temp, { mode: 0o700 })
    const chunks = splitNarration(panel.narration.replace(/[\r\n\t]+/g, ' ')).filter(text => text.trim()), segments: { text: string; audioPath: string }[] = []
    for (const [i, text] of chunks.entries()) {
      const audio = config ? await synthesizeVolcengine(config.provider, text, project.voice.speaker, project.voice.speed, new AbortController().signal, fetch, async () => config.key, config.url) : await localSynthesis(text, project.voice.speed, temp, new AbortController().signal)
      const audioPath = join(temp, `${i}.wav`); await writeFile(audioPath, audio, { flag: 'wx', mode: 0o600 }); segments.push({ text, audioPath })
    }
    const timeline = await prepareAudioTimeline([{ beats: [{ segments }] }], temp), audioInfo = await lstat(timeline.audioPath)
    if (audioInfo.size > 30_000_000) throw new Error('白板视频：配音超过大小限制，请缩短旁白。')
    await withCanvasProjectLock(root, id, async () => {
      if ((await loadCanvasProject(root, id)).revision !== revision) throw new Error('白板视频：生成期间工程已修改，请重新打开后重试。')
      if (signature(panel.narration, project.voice, await configFor(project.voice)) !== digest) throw new Error('白板视频：语音配置已改变，请重新生成。')
      const wav = await readFile(timeline.audioPath), duration = wav.readUInt32LE(40) / wav.readUInt32LE(28)
      const previous = await record(dir, panelId).catch(() => null), audio = `${randomUUID()}.wav`, audioPath = join(dir, audio), indexTemp = join(temp, 'index.json')
      await writeFile(indexTemp, JSON.stringify({ signature: digest, audio, duration }), { flag: 'wx', mode: 0o600 })
      await rename(timeline.audioPath, audioPath)
      try { await rename(indexTemp, join(dir, `${panelId}.json`)) } catch (error) { await rm(audioPath, { force: true }); throw error }
      if (previous && previous.audio !== audio) await rm(join(dir, previous.audio), { force: true }).catch(() => {})
    })
  } finally { if (temp) await rm(temp, { recursive: true, force: true }); running.delete(lock) }
}
export async function previewCanvasVoice(root: string, id: string, input: unknown, panelId: string): Promise<string> {
  if (!uuid.test(panelId)) throw new Error('白板视频：画布编号无效。')
  const states = await canvasVoiceStatuses(root, id, input), state = states.find(item => item.panelId === panelId)
  if (state?.state !== 'ready') throw new Error('白板视频：配音尚未生成或需要更新。')
  const dir = await folder(root, id), saved = await record(dir, panelId); if (!saved) throw new Error('白板视频：配音文件不存在，请重新生成。')
  return `data:audio/wav;base64,${(await readFile(join(dir, saved.audio))).toString('base64')}`
}
