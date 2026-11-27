import { useEffect, useState } from 'react'
import type { CloudVoiceProvider, VoiceConfig } from '../../../shared/whiteboard'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { NativeSelect } from '../components/ui/native-select'
import { KeyRound, Plus } from 'lucide-react'
import { useMessage } from '../components/MessageProvider'

const endpoints: Record<CloudVoiceProvider, string> = { volcengine: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional', 'agent-plan': 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional' }
export function VoiceSettings() {
  const showMessage = useMessage()
  const [items, setItems] = useState<VoiceConfig[]>([])
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [provider, setProvider] = useState<CloudVoiceProvider>('volcengine')
  const [url, setUrl] = useState(endpoints.volcengine)
  const [key, setKey] = useState('')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => { let active = true; void window.whiteboardApi.listVoiceConfigs().then(result => { if (active) { if (result.ok) setItems(result.value); else { setFailed(true); setMessage(result.error) } } }).catch(() => { if (active) { setFailed(true); setMessage('无法读取语音配置。') } }); return () => { active = false } }, [])
  const edit = (item?: VoiceConfig) => { setId(item?.id ?? ''); setName(item?.name ?? ''); setProvider(item?.provider ?? 'volcengine'); setUrl(item?.url ?? endpoints.volcengine); setKey(''); setMessage(''); setDeleting(false); setEditing(true) }
  const save = async () => { setBusy(true); setMessage(''); try { const result = await window.whiteboardApi.saveVoiceConfig({ id: id || undefined, name, provider, url, key }); if (result.ok) { setItems(result.value); setEditing(false); setKey(''); showMessage('语音账号已保存。') } else setMessage(result.error) } catch { setMessage('保存语音配置失败，请重试。') } finally { setBusy(false) } }
  const remove = async () => { setBusy(true); setMessage(''); try { const result = await window.whiteboardApi.deleteVoiceConfig(id); if (result.ok) { setItems(result.value); setEditing(false); setDeleting(false); setKey(''); showMessage('语音账号已删除。') } else setMessage(result.error) } catch { setMessage('删除语音配置失败，请重试。') } finally { setBusy(false) } }
  return <Card asChild><section className="form-card voice-settings" id="settings-voice">
    <div className="voice-settings-heading"><h2>语音服务</h2><Button type="button" variant="outline" size="sm" disabled={busy || failed || editing} onClick={() => edit()}><Plus aria-hidden="true"/>添加账号</Button></div>
    {items.length > 0 ? <div className="voice-account-list" aria-label="语音服务账号">{items.map(item => <div className="voice-account-row" key={item.id}><span className="voice-account-icon"><KeyRound aria-hidden="true"/></span><div className="voice-account-details"><strong title={item.name}>{item.name}</strong><span>{item.provider === 'agent-plan' ? '火山 Agent Plan 语音' : '火山引擎语音 2.0'} <span aria-hidden="true">·</span> {item.hasKey ? '密钥已配置' : '未配置密钥'}</span><small title={item.url}>{item.url}</small></div><Button type="button" variant="ghost" size="sm" disabled={busy || editing} aria-label={`编辑${item.name}`} onClick={() => edit(item)}>编辑</Button></div>)}</div> : !editing && !failed && <div className="voice-account-empty"><KeyRound aria-hidden="true"/><strong>还没有语音账号</strong></div>}
    {editing && <div className="voice-account-editor"><div className="voice-account-editor-heading"><h3>{id ? '编辑账号' : '添加账号'}</h3></div><div className="voice-account-fields"><Label className="field"><span>账号名称</span><Input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="自定义名称，例如：工作室账号"/></Label><Label className="field"><span>服务类型</span><NativeSelect value={provider} onChange={e => { const next = e.target.value === 'agent-plan' ? 'agent-plan' : 'volcengine'; if (url === endpoints[provider]) setUrl(endpoints[next]); setProvider(next) }}><option value="volcengine">火山引擎语音 2.0</option><option value="agent-plan">火山 Agent Plan 语音</option></NativeSelect></Label><Label className="field voice-account-wide"><span>API 地址</span><Input type="url" value={url} onChange={e => setUrl(e.target.value)} spellCheck={false}/></Label><Label className="field voice-account-wide"><span>API 密钥</span><Input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={id ? '留空以保留已保存的密钥' : '输入此账号的 API 密钥'}/><small>密钥将发送至填写的服务地址。</small></Label></div><div className="voice-settings-actions">{id && !deleting && <Button type="button" variant="ghost" disabled={busy} onClick={() => setDeleting(true)}>删除账号</Button>}{deleting && <><span>确定删除此账号？</span><Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>确认删除</Button></>}<div className="voice-account-action-spacer"/><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(false); setKey(''); setDeleting(false) }}>取消</Button><Button type="button" disabled={busy || !name.trim() || !url.trim() || (!id && !key.trim())} onClick={() => void save()}>{busy ? '保存中…' : '保存账号'}</Button></div></div>}
    {message && <p role="alert" className="whiteboard-hint">{message}</p>}
  </section></Card>
}
