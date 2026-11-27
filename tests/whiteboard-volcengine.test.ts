import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { synthesizeVolcengine, validateCloudVoiceProvider } from '../src/main/features/whiteboard/volcengine-voice'

const key = async () => 'test-key'
const signal = () => new AbortController().signal
const pcm = Buffer.alloc(2400, 2)
const frame = (code: number, data?: string) => JSON.stringify({ code, data })

test('火山语音解析分块响应并生成可用于时间线的 PCM WAV', async () => {
  const body = `data: ${frame(0, pcm.subarray(0, 1200).toString('base64'))}\n\ndata: ${frame(0, pcm.subarray(1200).toString('base64'))}\n\ndata: ${frame(20000000)}\n\n`
  const mock: typeof fetch = async (_url, options) => {
    assert.equal((options?.headers as Record<string, string>)['X-Api-Resource-Id'], 'seed-tts-2.0')
    assert.equal(JSON.parse(String(options?.body)).req_params.audio_params.speech_rate, 20)
    return new Response(body)
  }
  const wav = await synthesizeVolcengine('volcengine', '测试。', 'voice', 1.2, signal(), mock, key)
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wav.readUInt32LE(24), 24000)
  assert.equal(wav.readUInt32LE(40), pcm.length)
  assert.deepEqual(wav.subarray(44), pcm)
})

test('火山语音拒绝失败或没有结束标记的响应', async () => {
  const response = (body: string): typeof fetch => async () => new Response(body)
  await assert.rejects(synthesizeVolcengine('volcengine', '测试', 'voice', 1, signal(), response(frame(45000001)), key), /45000001/)
  await assert.rejects(synthesizeVolcengine('volcengine', '测试', 'voice', 1, signal(), response(frame(0, pcm.toString('base64'))), key), /不完整/)
})


test('Agent Plan 使用专属接口和对应密钥，不复用独立语音服务配置', async () => {
  let receivedProvider = ''
  const mock: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional')
    assert.equal((options?.headers as Record<string, string>)['X-Api-Key'], 'agent-key')
    assert.equal((options?.headers as Record<string, string>)['X-Api-Resource-Id'], 'seed-tts-2.0')
    return new Response(`${frame(0, pcm.toString('base64'))}\n${frame(20000000)}\n`)
  }
  const wav = await synthesizeVolcengine('agent-plan', '测试。', 'voice', 1, signal(), mock, async provider => { receivedProvider = provider; return 'agent-key' })
  assert.equal(receivedProvider, 'agent-plan')
  assert.deepEqual(wav.subarray(44), pcm)
  assert.throws(() => validateCloudVoiceProvider('../other'), /语音服务无效/)
})

test('所选配置的接口地址和密钥用于语音请求', async () => {
  const mock: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://voice.example.test/tts')
    assert.equal((options?.headers as Record<string, string>)['X-Api-Key'], 'profile-key')
    return new Response(`${frame(0, pcm.toString('base64'))}\n${frame(20000000)}\n`)
  }
  const wav = await synthesizeVolcengine('agent-plan', '测试。', 'voice', 1, signal(), mock, async () => 'profile-key', 'https://voice.example.test/tts')
  assert.deepEqual(wav.subarray(44), pcm)
})
