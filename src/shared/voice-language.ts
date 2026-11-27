export const voiceLanguages: Record<string, string> = { zh: '中文', en: '英语', ja: '日语', id: '印尼语', vi: '越南语', es: '西班牙语', pt: '葡萄牙语', th: '泰语', ko: '韩语', ru: '俄语', ms: '马来语', fil: '菲律宾语', fr: '法语', it: '意大利语', ar: '阿拉伯语', de: '德语' }
export function voiceLanguage(voice: { id: string; language: string }): string {
  const raw = voice.id.replace(/^ICL_uranus_/, '').split('_')[0]
  const prefix = raw === 'mx' ? 'es' : raw === 'tl' ? 'fil' : raw
  return voiceLanguages[prefix] ? prefix : voice.language.includes('中文') ? 'zh' : 'other'
}
