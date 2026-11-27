import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { synthesizeLocalVoice } from '../src/main/features/whiteboard/local-voice'
import { prepareAudioTimeline } from '../src/main/features/whiteboard/audio-timeline'

test('macOS 系统语音可生成兼容时间线的音频，并支持取消', { skip: process.platform !== 'darwin' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'whiteboard-local-voice-'))
  try {
    const controller = new AbortController()
    const paths = [join(dir, 'one.wav'), join(dir, 'two.wav')]
    for (const [index, text] of ['这是一段本地配音。', '这是第二段旁白。'].entries()) {
      const audio = await synthesizeLocalVoice(text, 1, dir, controller.signal)
      await writeFile(paths[index], audio)
    }
    const result = await prepareAudioTimeline([{ beats: [{ segments: paths.map((audioPath, index) => ({ text: `旁白${index}`, audioPath })) }] }], dir)
    assert.equal(result.segments.length, 2)
    assert.ok(result.segments.every(segment => segment.duration > 0))
    controller.abort()
    await assert.rejects(synthesizeLocalVoice('取消的语音', 1, dir, controller.signal), /取消/)
    assert.ok(!(await readdir(dir)).some(name => name.startsWith('.local-voice-')))
  } finally { await rm(dir, { recursive: true, force: true }) }
})
