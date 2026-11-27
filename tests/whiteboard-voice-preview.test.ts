import { test } from 'node:test'
import assert from 'node:assert/strict'
import { previewCloudVoice } from '../src/main/features/whiteboard/voice-preview'
import voiceCatalog from '../src/shared/volcengine-voices.json'
import { voiceLanguage } from '../src/shared/voice-language'

test('试听使用所选账号、音色、文案和语速，并拒绝无效输入', async () => {
  let calls = 0
  const deps: NonNullable<Parameters<typeof previewCloudVoice>[4]> = {
    resolve: async id => { assert.equal(id, 'config'); return { provider: 'agent-plan', url: 'https://example.test', key: 'test-key', cacheId: 'x' } },
    synthesize: async (provider, text, speaker, speed, _signal, _fetch, keyProvider, endpoint) => {
      calls++
      assert.equal(provider, 'agent-plan'); assert.equal(text, '试听文字'); assert.equal(speaker, 'zh_female_vv_uranus_bigtts')
      assert.equal(speed, 1.2); assert.equal(endpoint, 'https://example.test'); assert.equal(await keyProvider?.('agent-plan'), 'test-key')
      return Buffer.from('test')
    }
  }
  assert.equal(await previewCloudVoice('config', 'zh_female_vv_uranus_bigtts', ' 试听文字 ', 1.2, deps), 'data:audio/wav;base64,dGVzdA==')
  await assert.rejects(previewCloudVoice('config', '../bad', '试听', 1, deps), /音色/)
  await assert.rejects(previewCloudVoice('config', 'voice', '', 1, deps), /文案/)
  await assert.rejects(previewCloudVoice('config', 'voice', 'a'.repeat(121), 1, deps), /文案/)
  await assert.rejects(previewCloudVoice('config', 'voice', '试听', 3, deps), /语速/)
  assert.equal(calls, 1)
})

test('内置音色列表保留官方编号且没有重复', () => {
  assert.equal(voiceCatalog.voices.length, 473)
  assert.equal(new Set(voiceCatalog.voices.map(voice => voice.id)).size, voiceCatalog.voices.length)
  assert.ok(voiceCatalog.voices.some(voice => voice.id === 'zh_female_vv_uranus_bigtts'))
  assert.ok(voiceCatalog.voices.some(voice => voice.id === 'it_male_enzo_uranus_bigtts'))
  assert.equal(voiceLanguage({ id: 'ICL_uranus_zh_female_example_tob', language: '中文' }), 'zh')
  assert.equal(voiceLanguage({ id: 'mx_male_example_uranus_bigtts', language: '墨西哥西语' }), 'es')
  assert.equal(voiceLanguage({ id: 'tl_female_example_uranus_bigtts', language: '菲律宾语' }), 'fil')
  assert.ok(voiceCatalog.voices.every(voice => voiceLanguage(voice) !== 'other'))
})
