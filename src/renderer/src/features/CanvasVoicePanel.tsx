import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui/button'
import { VoicePicker } from './VoicePicker'
import type { CanvasProjectData, CanvasVoiceStatus } from '../../../shared/canvas-project'
import type { VoiceConfig } from '../../../shared/whiteboard'

type Props = { projectId: string | null; revision: string | null; data: CanvasProjectData; activePanel: number; dirty: boolean; disabled: boolean; onChange: (voice: CanvasProjectData['voice']) => void; onBusy: (busy: boolean) => void }
const labels: Record<CanvasVoiceStatus['state'], string> = { empty: '无旁白', missing: '未生成', ready: '已生成', stale: '需要更新', unavailable: '语音配置不可用' }
export function CanvasVoicePanel({ projectId, revision, data, activePanel, dirty, disabled, onChange, onBusy }: Props) {
  const [configs, setConfigs] = useState<VoiceConfig[]>([]), [configError, setConfigError] = useState('')
  const [statuses, setStatuses] = useState<CanvasVoiceStatus[]>([]), [statusError, setStatusError] = useState(''), [error, setError] = useState('')
  const [generating, setGenerating] = useState<string | null>(null), [failed, setFailed] = useState<Record<string, string>>({}), [playing, setPlaying] = useState(false), [refresh, setRefresh] = useState(0)
  const player = useRef<HTMLAudioElement | null>(null), request = useRef(0), previewRequest = useRef(0)
  const voice = data.voice, panel = data.panels[activePanel], snapshot = { voice, panels: data.panels.map(({ id, narration }) => ({ id, narration })) }
  const signature = JSON.stringify([voice, data.panels.map(item => [item.id, item.narration])])
  useEffect(() => {
    let live = true
    const load = () => { void window.canvasApi.listVoiceConfigs().then(result => { if (!live) return; if (result.ok) { setConfigs(result.value); setConfigError('') } else setConfigError(result.error) }).catch(() => { if (live) setConfigError('无法读取语音配置，请检查设置。') }); setRefresh(value => value + 1) }
    load(); window.addEventListener('focus', load); return () => { live = false; window.removeEventListener('focus', load) }
  }, [])
  useEffect(() => {
    const serial = ++request.current
    if (!projectId) { setStatuses([]); return }
    setStatuses([]); setStatusError('')
    const timer = window.setTimeout(() => { void window.canvasApi.voiceStatuses(projectId, snapshot).then(result => { if (serial !== request.current) return; if (result.ok) setStatuses(result.value); else setStatusError(result.error) }).catch(() => { if (serial === request.current) setStatusError('无法读取配音状态，请重试。') }) }, 200)
    return () => window.clearTimeout(timer)
  // Only voice settings and narration affect validity; other canvas edits do not.
  }, [projectId, signature, refresh])
  useEffect(() => { previewRequest.current++; player.current?.pause(); player.current = null; setPlaying(false) }, [projectId, panel.id, signature])
  useEffect(() => { setFailed({}); setError('') }, [projectId, signature])
  useEffect(() => () => { request.current++; player.current?.pause() }, [])
  const status = statuses.find(item => item.panelId === panel.id)?.state
  const canGenerate = !!projectId && !!revision && !dirty && !disabled && !generating && (voice.mode === 'local' || (!!voice.configId && configs.some(item => item.id === voice.configId)))
  const generate = async (ids: string[]) => {
    if (!projectId || !revision || !canGenerate) return
    setError(''); setFailed({}); onBusy(true)
    const failures: Record<string, string> = {}
    try {
      for (const id of ids) {
        setGenerating(id)
        try { const result = await window.canvasApi.generateVoice(projectId, revision, id); if (!result.ok) failures[id] = result.error }
        catch { failures[id] = '生成失败，请检查语音服务后重试。' }
        setFailed({ ...failures }); setRefresh(value => value + 1)
      }
      if (Object.keys(failures).length) setError(`${Object.keys(failures).length} 张画布的配音生成失败，请切换画布查看并重试。`)
    } finally { setGenerating(null); onBusy(false); setRefresh(value => value + 1) }
  }
  const preview = async () => {
    if (playing) { previewRequest.current++; player.current?.pause(); player.current = null; setPlaying(false); return }
    if (!projectId || status !== 'ready') return
    setError(''); const serial = ++previewRequest.current
    try {
      const result = await window.canvasApi.previewVoice(projectId, snapshot, panel.id)
      if (serial !== previewRequest.current) return
      if (!result.ok) { setError(result.error); return }
      const audio = new Audio(result.value); player.current = audio
      audio.onended = () => { if (player.current === audio) { player.current = null; setPlaying(false) } }
      audio.onerror = () => { if (player.current === audio) { player.current = null; setPlaying(false); setError('无法播放配音，请检查音频设备。') } }
      await audio.play(); if (serial === previewRequest.current) setPlaying(true); else audio.pause()
    } catch { setError('无法播放配音，请检查音频设备。') }
  }
  const pending = data.panels.filter(item => item.narration.trim() && statuses.some(status => status.panelId === item.id && status.state !== 'ready'))
  return <section className="wb-canvas-voice" aria-labelledby="canvas-voice-title">
    <h2 id="canvas-voice-title">工程配音</h2>
    <label htmlFor="canvas-voice-provider">配音方式</label><select id="canvas-voice-provider" disabled={disabled} value={voice.mode === 'local' ? 'local' : voice.configId} onChange={event => onChange({ ...voice, mode: event.target.value === 'local' ? 'local' : 'cloud', configId: event.target.value === 'local' ? '' : event.target.value })}><option value="local">macOS 系统语音</option>{voice.mode === 'cloud' && !configs.some(item => item.id === voice.configId) && <option value={voice.configId}>配置不可用</option>}{configs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    {voice.mode === 'cloud' && <VoicePicker value={voice.speaker} onChange={speaker => onChange({ ...voice, speaker })} configId={voice.configId} speed={voice.speed} disabled={disabled || !!configError} preview={window.canvasApi.previewCloudVoice}/>}
    <label htmlFor="canvas-voice-speed">语速</label><select id="canvas-voice-speed" value={voice.speed} disabled={disabled} onChange={event => onChange({ ...voice, speed: Number(event.target.value) })}><option value={0.8}>较慢</option><option value={1}>标准</option><option value={1.2}>较快</option><option value={1.4}>快速</option></select>
    {voice.mode === 'local' ? <p>使用 macOS 当前系统语音。</p> : <p>云端配音和试听可能产生用量。</p>}
    {configError && <p role="alert">{configError}</p>}{statusError && <><p role="alert">{statusError}</p><Button type="button" size="sm" variant="outline" onClick={() => setRefresh(value => value + 1)}>重试读取状态</Button></>}
    <p role="status">本页配音：{generating === panel.id ? '生成中…' : failed[panel.id] ? '生成失败' : status ? labels[status] : '正在检查…'}</p>
    {failed[panel.id] && <p role="alert">{failed[panel.id]}</p>}{dirty && <p>请先保存工程，再生成配音。</p>}
    <div className="wb-canvas-voice-actions"><Button size="sm" disabled={!canGenerate || !panel.narration.trim()} onClick={() => void generate([panel.id])}>{generating === panel.id ? '生成中…' : status === 'ready' ? '重新生成本页' : '生成本页配音'}</Button><Button size="sm" variant="outline" disabled={status !== 'ready' || !!generating} onClick={() => void preview()}>{playing ? '停止试听' : '试听本页'}</Button></div>
    <Button size="sm" variant="outline" disabled={!canGenerate || !pending.length || !!statusError} onClick={() => void generate(pending.map(item => item.id))}>生成待更新配音{pending.length > 0 ? `（${pending.length}）` : ''}</Button>
    {error && <p role="alert">{error}</p>}
  </section>
}
