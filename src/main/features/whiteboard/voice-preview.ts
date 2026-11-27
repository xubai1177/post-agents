import { resolveVoiceConfig } from './voice-config'
import { synthesizeVolcengine } from './volcengine-voice'

type Dependencies = { resolve: typeof resolveVoiceConfig; synthesize: typeof synthesizeVolcengine }
export async function previewCloudVoice(configId: unknown, speaker: unknown, text: unknown, speed: unknown, deps: Dependencies = { resolve: resolveVoiceConfig, synthesize: synthesizeVolcengine }): Promise<string> {
  if (typeof speaker !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(speaker)) throw new Error('白板视频：请选择有效音色。')
  if (typeof text !== 'string' || !text.trim() || text.length > 120 || /[\u0000-\u001f\u007f]/.test(text)) throw new Error('白板视频：试听文案需为 1 至 120 字的单行文字。')
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.6 || speed > 1.6) throw new Error('白板视频：语速无效。')
  const config = await deps.resolve(configId)
  const audio = await deps.synthesize(config.provider, text.trim(), speaker, speed, new AbortController().signal, fetch, async () => config.key, config.url)
  return `data:audio/wav;base64,${audio.toString('base64')}`
}
