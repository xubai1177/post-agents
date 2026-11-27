import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, LoaderCircle, Pause, Play } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog'
import catalog from '../../../shared/volcengine-voices.json'
import type { Result } from '../../../shared/settings'
import { voiceLanguage as languageOf, voiceLanguages as languageNames } from '../../../shared/voice-language'

const samples: Record<string, string> = { zh: '你好，很高兴和你见面。', en: 'Hello, it is nice to meet you.', ja: 'こんにちは、はじめまして。', id: 'Halo, senang bertemu denganmu.', vi: 'Xin chào, rất vui được gặp bạn.', es: 'Hola, mucho gusto en conocerte.', pt: 'Olá, prazer em conhecer você.', th: 'สวัสดี ยินดีที่ได้พบคุณ', ko: '안녕하세요, 만나서 반갑습니다.', ru: 'Здравствуйте, рад вас видеть.', ms: 'Helo, gembira bertemu anda.', fil: 'Kumusta, ikinagagalak kitang makilala.', fr: 'Bonjour, ravi de vous rencontrer.', it: 'Ciao, piacere di conoscerti.', ar: 'مرحباً، سعيد بلقائك.', de: 'Hallo, schön dich kennenzulernen.' }
const languages = ['zh', ...Array.from(new Set(catalog.voices.map(languageOf))).filter(item => item !== 'zh').sort((a, b) => (languageNames[a] ?? '其他').localeCompare(languageNames[b] ?? '其他', 'zh-CN'))]

export function VoicePicker({ value, onChange, configId, speed, disabled, preview = window.whiteboardApi?.previewVoice }: { value: string; onChange: (value: string) => void; configId: string; speed: number; disabled: boolean; preview?: (configId: string, speaker: string, text: string, speed: number) => Promise<Result<string>> }) {
  const [open, setOpen] = useState(false)
  const [language, setLanguage] = useState('zh')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState('')
  const [playing, setPlaying] = useState('')
  const [error, setError] = useState('')
  const [custom, setCustom] = useState('')
  const player = useRef<HTMLAudioElement | null>(null)
  const serial = useRef(0)
  const cache = useRef(new Map<string, string>())
  const selected = catalog.voices.find(voice => voice.id === value)
  const filtered = catalog.voices.filter(voice => languageOf(voice) === language && `${voice.name} ${voice.id} ${voice.language}`.toLowerCase().includes(query.trim().toLowerCase()))
  const stop = () => { serial.current++; player.current?.pause(); player.current = null; setPlaying(''); setLoading('') }
  useEffect(() => () => { serial.current++; player.current?.pause(); player.current = null }, [])
  const setDialogOpen = (next: boolean) => {
    stop(); setError(''); setOpen(next)
    if (next) { setLanguage('zh'); setQuery(''); setCustom('') }
  }
  const play = async (voice: typeof catalog.voices[number]) => {
    if (playing === voice.id) { stop(); return }
    stop()
    const request = ++serial.current, key = `${configId}: ${speed}: ${voice.id}`
    setError('')
    let audio = cache.current.get(key)
    if (!audio) {
      setLoading(voice.id)
      try {
        const result = await (preview ? preview(configId, voice.id, samples[languageOf(voice)] ?? samples.zh, speed) : Promise.reject(new Error('试听不可用')))
        if (request !== serial.current) return
        if (!result.ok) { setError(result.error); return }
        audio = result.value
        cache.current.set(key, audio)
      } catch { if (request === serial.current) setError('试听失败，请检查语音服务后重试。'); return }
      finally { if (request === serial.current) setLoading('') }
    }
    if (request !== serial.current) return
    const element = new Audio(audio)
    player.current = element
    element.onended = () => { if (player.current === element) { player.current = null; setPlaying('') } }
    element.onerror = () => { if (player.current === element) { player.current = null; setPlaying(''); setError('无法播放试听，请检查音频设备。') } }
    setPlaying(voice.id)
    try { await element.play() } catch { if (request === serial.current) { setPlaying(''); setError('无法播放试听，请检查音频设备后重试。') } }
  }
  return <Dialog open={open} onOpenChange={setDialogOpen}>
    <div className="whiteboard-voice-picker"><span className="whiteboard-voice-label">音色</span><DialogTrigger asChild><Button type="button" variant="outline" disabled={disabled} className="whiteboard-voice-trigger"><span>{selected?.name ?? (value || '选择音色')}</span><ChevronDown aria-hidden="true"/></Button></DialogTrigger></div>
    <DialogContent className="voice-library-dialog max-w-none sm:max-w-none">
      <DialogHeader><DialogTitle>选择音色</DialogTitle><DialogDescription>点击播放可试听；试听会调用语音服务，可能产生用量。</DialogDescription></DialogHeader>
      <div className="voice-library-controls"><label htmlFor="voice-library-language">语言<select id="voice-library-language" value={language} onChange={event => { stop(); setError(''); setLanguage(event.target.value) }}>{languages.map(lang => <option key={lang} value={lang}>{languageNames[lang] ?? '其他'}</option>)}</select></label><label htmlFor="voice-library-search">搜索音色<input id="voice-library-search" placeholder="搜索名称或音色 ID…" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
      <span className="sr-only" role="status">{loading ? `正在生成${catalog.voices.find(voice => voice.id === loading)?.name ?? ''}的试听` : playing ? `正在试听${catalog.voices.find(voice => voice.id === playing)?.name ?? ''}` : ''}</span>
      {error && <p className="whiteboard-error" role="alert">{error}</p>}
      <div className="voice-library-list" aria-label={`${languageNames[language] ?? '其他'}音色`}>
        {filtered.length === 0 ? <p className="whiteboard-hint">没有找到匹配的音色。</p> : filtered.map(voice => <div className="voice-library-row" key={voice.id} data-selected={value === voice.id}>
          <button type="button" className="voice-library-select" onClick={() => { onChange(voice.id); setDialogOpen(false) }}><span><strong>{voice.name}</strong><small>{voice.language}</small></span>{value === voice.id && <Check aria-label="已选择"/>}</button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={!!loading} aria-label={loading === voice.id ? `正在生成${voice.name}的试听` : `${playing === voice.id ? '停止' : '试听'}${voice.name}`} onClick={() => void play(voice)}>{loading === voice.id ? <LoaderCircle className="voice-library-loading" aria-hidden="true"/> : playing === voice.id ? <Pause aria-hidden="true"/> : <Play aria-hidden="true"/>}</Button>
        </div>)}
      </div>
      <details className="voice-library-custom"><summary>手动输入音色 ID</summary><div><label className="sr-only" htmlFor="voice-library-custom">音色 ID</label><input id="voice-library-custom" value={custom} maxLength={128} spellCheck={false} placeholder="输入音色 ID…" onChange={event => setCustom(event.target.value)}/><Button type="button" variant="outline" disabled={!/^[a-zA-Z0-9_-]{1,128}$/.test(custom)} onClick={() => { onChange(custom); setDialogOpen(false) }}>使用</Button></div></details>
    </DialogContent>
  </Dialog>
}
