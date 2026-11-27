import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

/** Use the user's system voice without placing narration in command-line arguments. */
export async function synthesizeLocalVoice(text: string, speed: number, directory: string, signal: AbortSignal): Promise<Buffer> {
  if (process.platform !== 'darwin') throw new Error('白板视频：本地系统配音仅支持 macOS。')
  if (!text.trim() || !Number.isFinite(speed) || speed < 0.6 || speed > 1.6) throw new Error('白板视频：本地语音设置无效。')
  const path = join(directory, `.local-voice-${randomUUID()}.wav`)
  try {
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new Error('白板视频：已取消生成。')); return }
      const child = spawn('/usr/bin/say', ['-r', String(Math.round(180 * speed)), '-o', path, '--file-format=WAVE', '--data-format=LEI16@24000', '-f', '-'], { shell: false, stdio: ['pipe', 'ignore', 'pipe'] })
      let diagnostic = ''
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => { diagnostic = (diagnostic + chunk).slice(-1000) })
      const abort = () => child.kill('SIGTERM')
      signal.addEventListener('abort', abort, { once: true })
      child.stdin.on('error', () => {})
      child.on('error', () => { signal.removeEventListener('abort', abort); reject(new Error('白板视频：无法启动 macOS 系统语音。')) })
      child.on('close', code => {
        signal.removeEventListener('abort', abort)
        if (signal.aborted) reject(new Error('白板视频：已取消生成。'))
        else if (code !== 0) reject(new Error(`白板视频：系统语音合成失败，请检查 macOS 系统语音设置。${diagnostic ? `（${diagnostic.trim()}）` : ''}`))
        else resolve()
      })
      child.stdin.end(text, 'utf8')
    })
    const audio = await readFile(path)
    if (audio.length < 256 || audio.length > 10 * 1024 * 1024) throw new Error('白板视频：系统语音生成的音频无效。')
    return audio
  } finally { await rm(path, { force: true }) }
}
