import { readFile, writeFile } from 'node:fs/promises'
import { subtitlesSrt } from './timeline'

interface VoiceSegment { text: string; audioPath: string }
interface Scene { beats: { segments: VoiceSegment[] }[] }
interface Segment { scene: number; beat: number; text: string; start: number; duration: number }

// Validate PCM WAV chunks and use sample counts for a shared audio/visual clock.
export async function prepareAudioTimeline(scenes: Scene[], directory: string): Promise<{ segments: Segment[]; frames: number; audioPath: string }> {
  const chunks: Buffer[] = [], segments: Segment[] = []
  let format: Buffer | undefined, bytesPerSecond = 0, blockAlign = 0, totalBytes = 0
  for (const [sceneIndex, scene] of scenes.entries()) for (const [beatIndex, beat] of scene.beats.entries()) {
    if (!beat.segments.length) throw new Error('白板视频：节拍缺少语音。')
    for (const item of beat.segments) {
      const wav = await readFile(item.audioPath)
      if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE' || wav.readUInt32LE(4) + 8 !== wav.length) throw new Error('白板视频：语音文件无效。')
      let fmt: Buffer | undefined, data: Buffer | undefined
      for (let pos = 12; pos + 8 <= wav.length;) {
        const size = wav.readUInt32LE(pos + 4), end = pos + 8 + size
        if (end > wav.length) throw new Error('白板视频：语音文件无效。')
        const id = wav.toString('ascii', pos, pos + 4)
        if (id === 'fmt ') fmt = wav.subarray(pos + 8, end)
        if (id === 'data') data = wav.subarray(pos + 8, end)
        pos = end + (size % 2)
      }
      if (!fmt || fmt.length < 16 || fmt.readUInt16LE(0) !== 1 || !data?.length) throw new Error('白板视频：语音格式不受支持。')
      if (!format) { format = Buffer.from(fmt); bytesPerSecond = fmt.readUInt32LE(8); blockAlign = fmt.readUInt16LE(12) }
      if (!format.equals(fmt) || !bytesPerSecond || !blockAlign || data.length % blockAlign || data.length / bytesPerSecond > 600) throw new Error('白板视频：语音格式或时长无效。')
      const start = totalBytes / bytesPerSecond, duration = data.length / bytesPerSecond
      segments.push({ scene: sceneIndex, beat: beatIndex, text: item.text, start, duration })
      chunks.push(data); totalBytes += data.length
    }
  }
  if (!format || !totalBytes || totalBytes > 0xffffffff - 64 || totalBytes / bytesPerSecond > 3600) throw new Error('白板视频：语音时长无效。')
  // Emit canonical PCM fmt (16 bytes) and even-padded RIFF chunks.
  const pcm = format.subarray(0, 16), padding = totalBytes % 2
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + totalBytes + padding, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); pcm.copy(header, 20); header.write('data', 36); header.writeUInt32LE(totalBytes, 40)
  const audioPath = `${directory}/语音.wav`
  await writeFile(audioPath, Buffer.concat([header, ...chunks, Buffer.alloc(padding)]))
  const captions = segments.map(segment => ({ text: segment.text, startMs: Math.round(segment.start * 1000), endMs: Math.round((segment.start + segment.duration) * 1000) }))
  await writeFile(`${directory}/字幕.srt`, subtitlesSrt(captions))
  return { segments, frames: Math.ceil(totalBytes / bytesPerSecond * 30), audioPath }
}
