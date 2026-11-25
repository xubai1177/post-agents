import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { defaultAccentColor, defaultPanelOpacity, type AppSettings, type KeyChange, type LegacySettings } from '../../../shared/settings'
import { Icon } from '../components/Icon'
import { defaultPlatformLinks } from '../../../shared/platform-links'
import { WorkspaceManager } from './WorkspaceManager'

const settingsKey = 'post-agents-model-settings'
const initialSettings: AppSettings = { appearance: 'light', accentColor: defaultAccentColor, panelOpacity: defaultPanelOpacity, apiUrl: '', model: '', draftsDirectory: '', hasApiKey: false, imageService: 'shared', imageApiUrl: '', imageModel: '', hasImageApiKey: false, platformPrompts: {}, titlePrompts: {}, platformLinks: defaultPlatformLinks() }
function readLegacySettings(): LegacySettings | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(settingsKey) ?? 'null')
    if (value && typeof value === 'object' && 'apiUrl' in value && 'model' in value && typeof value.apiUrl === 'string' && typeof value.model === 'string') return { apiUrl: value.apiUrl, model: value.model }
  } catch { /* Leave invalid legacy data untouched. */ }
  return undefined
}
export function Settings({ onSaved, workspaceLocked, softwareUpdates }: { onSaved: (directoryChanged: boolean) => void; workspaceLocked: boolean; softwareUpdates: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(initialSettings)
  const [accentColor, setAccentColor] = useState<string>(defaultAccentColor)
  const [panelOpacity, setPanelOpacity] = useState(defaultPanelOpacity)
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
  const [models, setModels] = useState<string[]>([])
  const [imageModels, setImageModels] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelFeedback, setModelFeedback] = useState('')
  const [imageModelFeedback, setImageModelFeedback] = useState('')
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
        setSettings(result.value); setAccentColor(result.value.accentColor); setPanelOpacity(result.value.panelOpacity); setApiUrl(result.value.apiUrl); setModel(result.value.model); setDirectory(result.value.draftsDirectory); setImageService(result.value.imageService); setImageApiUrl(result.value.imageApiUrl); setImageModel(result.value.imageModel)
        if (legacy && result.value.apiUrl === legacy.apiUrl && result.value.model === legacy.model) { try { localStorage.removeItem(settingsKey) } catch { /* Legacy cleanup can be retried later. */ } }
      } catch { if (active) setError('无法加载设置，请重试。') } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [])
  useEffect(() => () => { window.dispatchEvent(new Event('appearance-saved')) }, [])
  useEffect(() => { setModels([]); setModelFeedback('') }, [apiUrl, apiKey, clearKey])
  useEffect(() => { setImageModels([]); setImageModelFeedback('') }, [apiUrl, apiKey, clearKey, imageService, imageApiUrl, imageKey, clearImageKey])
  async function listModels(image: boolean) {
    const custom = image && imageService === 'custom'
    const key = custom ? imageKey : apiKey
    const clear = custom ? clearImageKey : clearKey
    const keyChange: KeyChange = clear ? { action: 'clear' } : key ? { action: 'replace', value: key } : { action: 'keep' }
    const feedback = image ? setImageModelFeedback : setModelFeedback
    const setList = image ? setImageModels : setModels
    setFetchingModels(true); feedback('正在获取模型列表…'); setList([])
    try {
      const result = await window.settingsApi.listModels({ apiUrl: (custom ? imageApiUrl : apiUrl).trim(), service: custom ? 'image' : 'text', apiKey: keyChange })
      if (!result.ok) feedback(result.error)
      else { setList(result.value); feedback(result.value.length ? `已获取 ${result.value.length} 个模型，可选择或手动输入。` : '服务未返回模型，可手动输入。') }
    } catch { feedback('获取模型列表失败，请检查服务或手动输入。') } finally { setFetchingModels(false) }
  }
  async function chooseDirectory() {
    if (workspaceLocked) return
    setError(''); setMessage(''); setSaving(true)
    try {
      const result = await window.settingsApi.chooseDirectory()
      if (!result.ok) setError(result.error)
      else if (result.value !== null) setDirectory(result.value)
    } catch { setError('无法打开目录选择窗口，请重试。') } finally { setSaving(false) }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setMessage(''); setError('')
    if (workspaceLocked && directory !== settings.draftsDirectory) { setError('生成任务进行期间不能切换工作空间。'); return }
    const url = apiUrl.trim()
    if (url) { try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error() } catch { setError('请输入有效的 HTTP 或 HTTPS API 地址，地址中不能包含账号或密码。'); return } }
    if (apiKey && !apiKey.trim()) { setError('API 密钥不能只包含空格。'); return }
    if (imageApiUrl.trim()) { try { const parsed = new URL(imageApiUrl.trim()); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error() } catch { setError('请输入有效的图片 API 地址。'); return } }
    if (imageKey && !imageKey.trim()) { setError('图片 API 密钥不能只包含空格。'); return }
    const imageKeyChange: KeyChange = clearImageKey ? { action: 'clear' } : imageKey ? { action: 'replace', value: imageKey } : { action: 'keep' }
    const keyChange: KeyChange = clearKey ? { action: 'clear' } : apiKey ? { action: 'replace', value: apiKey } : { action: 'keep' }
    setSaving(true)
    try {
      const result = await window.settingsApi.save({ appearance: 'light', accentColor, panelOpacity, apiUrl: url, model: model.trim(), draftsDirectory: directory, apiKey: keyChange, imageService, imageApiUrl: imageApiUrl.trim(), imageModel: imageModel.trim(), imageApiKey: imageKeyChange })
      if (!result.ok) { setError(result.error); return }
      setSettings(result.value); setAccentColor(result.value.accentColor); setPanelOpacity(result.value.panelOpacity); setApiUrl(result.value.apiUrl); setModel(result.value.model); setDirectory(result.value.draftsDirectory); setApiKey(''); setClearKey(false); setImageKey(''); setClearImageKey(false); setMessage('设置已保存在本机。'); window.dispatchEvent(new Event('appearance-saved')); onSaved(result.value.draftsDirectory !== settings.draftsDirectory)
    } catch { setError('保存失败，请检查本机权限后重试。') } finally { setSaving(false) }
  }
  return <div className="page-wrap settings-page"><div className="page-title settings-title"><h1>设置</h1></div><div className="settings-layout"><nav className="settings-nav" aria-label="设置目录"><strong>设置目录</strong><Button variant="ghost" type="button" onClick={() => document.getElementById('workspace-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>工作空间管理</Button><Button variant="ghost" type="button" onClick={() => document.getElementById('settings-appearance')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>外观</Button><Button variant="ghost" type="button" onClick={() => document.getElementById('settings-model')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>模型服务</Button><Button variant="ghost" type="button" onClick={() => document.getElementById('settings-image')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>图片生成服务</Button><Button variant="ghost" type="button" onClick={() => document.getElementById('settings-update')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>软件更新</Button></nav><div><div id="workspace-settings">{workspaceLocked && <p role="status">生成任务进行期间，暂不能切换工作空间。</p>}<WorkspaceManager disabled={loading || saving || workspaceLocked} onChanged={() => onSaved(true)} /></div><form className="settings-form" onSubmit={save}>
    <fieldset disabled={loading || saving || fetchingModels} className="settings-fields"><Card asChild><section className="form-card" id="settings-appearance">
      <div className="form-heading"><div className="form-heading-icon"><Icon name="settings" size={20}/></div><div><h2>外观</h2><p>选择主题色与面板通透程度。</p></div></div>
      <div className="appearance-colors">
        <Label className="appearance-color"><span>主题颜色</span><Input aria-label="选择主题颜色" type="color" value={accentColor} onChange={e => { setAccentColor(e.target.value); document.documentElement.style.setProperty('--brand', e.target.value) }}/><code>{accentColor.toUpperCase()}</code></Label>
        <Button variant="link" size="xs" type="button" className="reload-button" onClick={() => { setAccentColor(defaultAccentColor); document.documentElement.style.setProperty('--brand', defaultAccentColor) }}>恢复默认配色</Button>
      </div>
      <div className="panel-opacity-control"><div className="panel-opacity-heading"><Label htmlFor="panel-opacity">面板不透明度</Label><output htmlFor="panel-opacity">{panelOpacity}%</output></div><input id="panel-opacity" type="range" min={70} max={100} step={1} value={panelOpacity} onChange={event => { const value = Number(event.target.value); setPanelOpacity(value); document.documentElement.style.setProperty('--panel-opacity', `${value}%`) }} /><small>调整侧栏、卡片和弹窗的通透程度；文字与控件保持清晰。保存后生效。</small></div>
    </section></Card>
    <Card asChild><section className="form-card" id="settings-model"><div className="form-heading"><div className="form-heading-icon"><Icon name="settings" size={20}/></div><div><h2>模型服务</h2><p>配置创作时使用的模型</p></div></div><Label className="field"><span>API 地址</span><Input value={apiUrl} onChange={(e) => { setApiUrl(e.target.value); setMessage('') }} placeholder="https://api.example.com/v1"/><small>填写模型服务提供的 API 地址</small></Label><Label className="field"><span>API 密钥 {settings.hasApiKey && !clearKey && <em>已设置</em>}</span><Input type="password" autoComplete="off" value={apiKey} disabled={clearKey} onChange={(e) => { setApiKey(e.target.value); setMessage('') }} placeholder={settings.hasApiKey ? '留空以保留已保存的密钥' : '输入 API 密钥'}/><small>手动设置的密钥通过系统安全存储加密；本机默认密钥来自本地配置。</small></Label>{settings.hasApiKey && <Label className="clear-key"><Checkbox checked={clearKey} onCheckedChange={checked => { setClearKey(checked === true); if (checked === true) setApiKey(''); setMessage('') }}/> 保存时清除已保存的密钥</Label>}<Label className="field"><span>模型名称</span><Input list="text-model-options" value={model} onChange={(e) => { setModel(e.target.value); setMessage('') }} placeholder="选择或输入模型名称"/><datalist id="text-model-options">{models.map(name => <option key={name} value={name}/>)}</datalist><small>选择列表中的模型，或手动输入。</small></Label><Button variant="link" size="xs" type="button" className="reload-button" onClick={() => void listModels(false)}>获取模型列表</Button>{modelFeedback && <p role="status">{modelFeedback}</p>}</section></Card>
    <Card asChild><section className="form-card" id="settings-image"><div className="form-heading"><div className="form-heading-icon"><Icon name="image" size={20}/></div><div><h2>图片生成服务</h2><p>配置兼容 OpenAI 图片接口的模型</p></div></div><Label className="field"><span>服务配置</span><NativeSelect size="sm" value={imageService} onChange={(e) => { setImageService(e.target.value === 'custom' ? 'custom' : 'shared'); setMessage('') }}><option value="shared">复用模型服务地址与密钥</option><option value="custom">使用单独的图片服务</option></NativeSelect></Label>{imageService === 'custom' && <><Label className="field"><span>图片 API 地址</span><Input value={imageApiUrl} onChange={(e) => setImageApiUrl(e.target.value)} placeholder="https://api.example.com/v1"/></Label><Label className="field"><span>图片 API 密钥 {settings.hasImageApiKey && !clearImageKey && <em>已设置</em>}</span><Input type="password" autoComplete="off" value={imageKey} disabled={clearImageKey} onChange={(e) => setImageKey(e.target.value)} placeholder={settings.hasImageApiKey ? '留空以保留已保存的密钥' : '输入图片服务密钥'}/><small>密钥使用系统安全存储加密。</small></Label>{settings.hasImageApiKey && <Label className="clear-key"><Checkbox checked={clearImageKey} onCheckedChange={checked => { setClearImageKey(checked === true); if (checked === true) setImageKey('') }}/> 保存时清除图片密钥</Label>}</>}<Label className="field"><span>图片模型名称</span><Input list="image-model-options" value={imageModel} onChange={(e) => setImageModel(e.target.value)} placeholder="选择或输入图片模型名称"/><datalist id="image-model-options">{imageModels.map(name => <option key={name} value={name}/>)}</datalist><small>列表可能包含其他类型的模型，请确认所选模型支持图片生成。</small></Label><Button variant="link" size="xs" type="button" className="reload-button" onClick={() => void listModels(true)}>获取图片模型列表</Button>{imageModelFeedback && <p role="status">{imageModelFeedback}</p>}</section></Card>
    <Card asChild><section className="form-card workspace-settings"><div className="form-heading"><div className="form-heading-icon"><Icon name="file" size={20}/></div><div><h2>内容工作区</h2><p>选择本地工作空间</p></div></div><div className="field"><span>工作空间位置</span><div className="directory-control"><Input aria-label="工作空间位置" readOnly value={directory} placeholder="尚未选择目录"/><Button variant="ghost" type="button" disabled={workspaceLocked} onClick={() => void chooseDirectory()}>选择目录</Button></div><small>文案会读取和保存到此目录下。</small></div></section></Card></fieldset>
    <div className="settings-save">
      <div className="settings-save-feedback">
        {loading ? <span role="status">正在加载设置…</span>
          : error ? <span className="settings-error" role="alert">{error}</span>
          : message ? <span className="settings-success" role="status">{message}</span>
          : <span>设置保存在此设备上</span>}
      </div>
      <Button type="submit" className="primary-button" disabled={loading || saving || fetchingModels || Boolean(error && !window.settingsApi)}>{saving ? '处理中…' : '保存设置'}</Button></div></form><div className="mt-3">{softwareUpdates}</div></div></div></div>
}

