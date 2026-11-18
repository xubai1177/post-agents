import { useEffect, useState, type FormEvent } from 'react'
import type { AppSettings, KeyChange, LegacySettings } from '../../../shared/settings'
import { Icon } from '../components/Icon'

const settingsKey = 'post-agents-model-settings'
const initialSettings: AppSettings = { apiUrl: '', model: '', draftsDirectory: '', hasApiKey: false, imageService: 'shared', imageApiUrl: '', imageModel: '', hasImageApiKey: false }
function readLegacySettings(): LegacySettings | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(settingsKey) ?? 'null')
    if (value && typeof value === 'object' && 'apiUrl' in value && 'model' in value && typeof value.apiUrl === 'string' && typeof value.model === 'string') return { apiUrl: value.apiUrl, model: value.model }
  } catch { /* Leave invalid legacy data untouched. */ }
  return undefined
}
export function Settings({ onSaved }: { onSaved: (directoryChanged: boolean) => void }) {
  const [settings, setSettings] = useState<AppSettings>(initialSettings)
  const [apiUrl, setApiUrl] = useState('')
  const [model, setModel] = useState('')
  const [directory, setDirectory] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [imageService, setImageService] = useState<'shared' | 'custom'>('shared')
  const [imageApiUrl, setImageApiUrl] = useState('')
  const [imageModel, setImageModel] = useState('')
  const [imageKey, setImageKey] = useState('')
  const [clearImageKey, setClearImageKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    async function load() {
      if (!window.settingsApi) { if (active) { setError('请在桌面应用中使用设置。'); setLoading(false) } return }
      const legacy = readLegacySettings()
      try {
        const result = await window.settingsApi.load(legacy)
        if (!active) return
        if (!result.ok) { setError(result.error); return }
        setSettings(result.value); setApiUrl(result.value.apiUrl); setModel(result.value.model); setDirectory(result.value.draftsDirectory); setImageService(result.value.imageService); setImageApiUrl(result.value.imageApiUrl); setImageModel(result.value.imageModel)
        if (legacy && result.value.apiUrl === legacy.apiUrl && result.value.model === legacy.model) { try { localStorage.removeItem(settingsKey) } catch { /* Legacy cleanup can be retried later. */ } }
      } catch { if (active) setError('无法加载设置，请重试。') } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [])
  async function chooseDirectory() {
    setError(''); setMessage(''); setSaving(true)
    try {
      const result = await window.settingsApi.chooseDirectory()
      if (!result.ok) setError(result.error)
      else if (result.value !== null) setDirectory(result.value)
    } catch { setError('无法打开目录选择窗口，请重试。') } finally { setSaving(false) }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setMessage(''); setError('')
    const url = apiUrl.trim()
    if (url) { try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error() } catch { setError('请输入有效的 HTTP 或 HTTPS API 地址，地址中不能包含账号或密码。'); return } }
    if (apiKey && !apiKey.trim()) { setError('API 密钥不能只包含空格。'); return }
    if (imageApiUrl.trim()) { try { const parsed = new URL(imageApiUrl.trim()); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error() } catch { setError('请输入有效的图片 API 地址。'); return } }
    if (imageKey && !imageKey.trim()) { setError('图片 API 密钥不能只包含空格。'); return }
    const imageKeyChange: KeyChange = clearImageKey ? { action: 'clear' } : imageKey ? { action: 'replace', value: imageKey } : { action: 'keep' }
    const keyChange: KeyChange = clearKey ? { action: 'clear' } : apiKey ? { action: 'replace', value: apiKey } : { action: 'keep' }
    setSaving(true)
    try {
      const result = await window.settingsApi.save({ apiUrl: url, model: model.trim(), draftsDirectory: directory, apiKey: keyChange, imageService, imageApiUrl: imageApiUrl.trim(), imageModel: imageModel.trim(), imageApiKey: imageKeyChange })
      if (!result.ok) { setError(result.error); return }
      setSettings(result.value); setApiUrl(result.value.apiUrl); setModel(result.value.model); setDirectory(result.value.draftsDirectory); setApiKey(''); setClearKey(false); setImageKey(''); setClearImageKey(false); setMessage('设置已保存在本机。'); onSaved(result.value.draftsDirectory !== settings.draftsDirectory)
    } catch { setError('保存失败，请检查本机权限后重试。') } finally { setSaving(false) }
  }
  return <div className="page-wrap narrow"><div className="page-title settings-title"><div className="eyebrow"><span/> PREFERENCES</div><h1>设置</h1><p>管理模型与本地内容工作区。</p></div><form className="settings-form" onSubmit={save}>
    <fieldset disabled={loading || saving} className="settings-fields"><section className="form-card"><div className="form-heading"><div className="form-heading-icon"><Icon name="settings" size={20}/></div><div><h2>模型服务</h2><p>配置创作时使用的模型</p></div></div><label className="field"><span>API 地址</span><input value={apiUrl} onChange={(e) => { setApiUrl(e.target.value); setMessage('') }} placeholder="https://api.example.com/v1"/><small>填写模型服务提供的 API 地址</small></label><label className="field"><span>API 密钥 {settings.hasApiKey && !clearKey && <em>已设置</em>}</span><input type="password" autoComplete="off" value={apiKey} disabled={clearKey} onChange={(e) => { setApiKey(e.target.value); setMessage('') }} placeholder={settings.hasApiKey ? '留空以保留已保存的密钥' : '输入 API 密钥'}/><small>手动设置的密钥通过系统安全存储加密；本机默认密钥来自本地配置。</small></label>{settings.hasApiKey && <label className="clear-key"><input type="checkbox" checked={clearKey} onChange={(e) => { setClearKey(e.target.checked); if (e.target.checked) setApiKey(''); setMessage('') }}/> 保存时清除已保存的密钥</label>}<label className="field"><span>模型名称</span><input value={model} onChange={(e) => { setModel(e.target.value); setMessage('') }} placeholder="例如：model-name"/><small>填写服务支持的模型名称</small></label></section>
    <section className="form-card"><div className="form-heading"><div className="form-heading-icon"><Icon name="image" size={20}/></div><div><h2>图片生成服务</h2><p>配置兼容 OpenAI 图片接口的模型</p></div></div><label className="field"><span>服务配置</span><select value={imageService} onChange={(e) => { setImageService(e.target.value === 'custom' ? 'custom' : 'shared'); setMessage('') }}><option value="shared">复用模型服务地址与密钥</option><option value="custom">使用单独的图片服务</option></select></label>{imageService === 'custom' && <><label className="field"><span>图片 API 地址</span><input value={imageApiUrl} onChange={(e) => setImageApiUrl(e.target.value)} placeholder="https://api.example.com/v1"/></label><label className="field"><span>图片 API 密钥 {settings.hasImageApiKey && !clearImageKey && <em>已设置</em>}</span><input type="password" autoComplete="off" value={imageKey} disabled={clearImageKey} onChange={(e) => setImageKey(e.target.value)} placeholder={settings.hasImageApiKey ? '留空以保留已保存的密钥' : '输入图片服务密钥'}/><small>密钥使用系统安全存储加密。</small></label>{settings.hasImageApiKey && <label className="clear-key"><input type="checkbox" checked={clearImageKey} onChange={(e) => { setClearImageKey(e.target.checked); if (e.target.checked) setImageKey('') }}/> 保存时清除图片密钥</label>}</>}<label className="field"><span>图片模型名称</span><input value={imageModel} onChange={(e) => setImageModel(e.target.value)} placeholder="填写服务支持的图片模型名称"/><small>请确认服务支持图片生成接口。</small></label></section>
    <section className="form-card workspace-settings"><div className="form-heading"><div className="form-heading-icon"><Icon name="file" size={20}/></div><div><h2>内容工作区</h2><p>选择本地草稿目录</p></div></div><div className="field"><span>草稿目录</span><div className="directory-control"><input aria-label="草稿目录" readOnly value={directory} placeholder="尚未选择目录"/><button type="button" onClick={() => void chooseDirectory()}>选择目录</button></div><small>文案会读取和保存到此目录下。</small></div></section></fieldset>
    {loading && <p className="settings-feedback" role="status">正在加载设置…</p>}{error && <p className="error settings-feedback" role="alert">{error}</p>}{message && <p className="success settings-feedback" role="status">{message}</p>}<div className="settings-save"><span>设置保存在此设备上</span><button type="submit" className="primary-button" disabled={loading || saving || Boolean(error && !window.settingsApi)}>{saving ? '处理中…' : '保存设置'}</button></div></form></div>
}

