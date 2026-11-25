import { useEffect, useState, type FormEvent } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Icon } from '../components/Icon'
import { platforms, type Platform } from '../../../shared/drafts'
import { defaultPlatformLinks, validPlatformLinks, validPlatformUrl, type PlatformLink } from '../../../shared/platform-links'
import { defaultPlatformPrompts, defaultTitlePrompts, resolvePlatformPrompts, resolveTitlePrompts } from '../../../shared/platform-prompts'
import { useMessage } from '../components/MessageProvider'
import { platformLogos } from './platform-logos'
import { PlatformPromptTest } from './PlatformPromptTest'

export function PlatformSettings({ onSaved }: { onSaved: (links: PlatformLink[]) => void }) {
  const showMessage = useMessage()
  const [links, setLinks] = useState<PlatformLink[]>(defaultPlatformLinks)
  const [bodyRules, setBodyRules] = useState(() => resolvePlatformPrompts())
  const [titleRules, setTitleRules] = useState(() => resolveTitlePrompts())
  const [selected, setSelected] = useState(0)
  const [testBodies, setTestBodies] = useState<Partial<Record<Platform, string>>>({})
  const exampleBody = '想培养阅读习惯，可以先从每天十分钟开始。把书放在随手可及的地方，选择自己感兴趣的内容，在固定时间阅读。坚持一段时间后，再根据自己的节奏慢慢增加阅读时间。'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void window.settingsApi.load().then(result => {
      if (!active) return
      if (!result.ok) { setError(result.error); return }
      setLinks(result.value.platformLinks)
      setBodyRules(resolvePlatformPrompts(result.value.platformPrompts))
      setTitleRules(resolveTitlePrompts(result.value.titlePrompts))
    }).catch(() => { if (active) setError('无法读取平台配置，请重新打开页面。') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function editLinks(next: PlatformLink[]) { setLinks(next); setDirty(true); setError('') }
  const item = links[selected]
  const builtIn = selected < platforms.length
  const platform: Platform | undefined = builtIn ? platforms.find(value => value === item?.name) : undefined
  const duplicate = item && links.some((other, index) => index !== selected && other.name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase())
  function update(change: Partial<PlatformLink>) {
    editLinks(links.map((link, index) => index === selected ? { ...link, ...change } : link))
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    const normalized = links.map(link => ({ name: link.name.trim(), url: link.url.trim(), enabled: link.enabled !== false }))
    if (!validPlatformLinks(normalized)) { setError('请检查各平台的名称和链接。'); return }
    setSaving(true); setError('')
    try {
      const result = await window.settingsApi.savePlatformConfig({ platformLinks: normalized, platformPrompts: bodyRules, titlePrompts: titleRules })
      if (!result.ok) { showMessage(result.error, true); return }
      setLinks(result.value.platformLinks)
      setBodyRules(resolvePlatformPrompts(result.value.platformPrompts))
      setTitleRules(resolveTitlePrompts(result.value.titlePrompts))
      setDirty(false)
      onSaved(result.value.platformLinks)
      showMessage('平台配置已保存。')
    } catch { showMessage('保存失败，请重试。', true) } finally { setSaving(false) }
  }

  return <section className="platform-page page-wrap">
    <header className="platform-page-header"><h1>平台配置</h1><Button type="submit" form="platform-settings-form" size="sm" disabled={loading || saving || !dirty}>{saving ? '保存中…' : '保存配置'}</Button></header>
    {error && <p className="platform-page-error" role="alert">{error}</p>}
    {loading ? <p role="status">正在读取平台配置…</p> : <form id="platform-settings-form" onSubmit={save}>
      <div className="platform-settings-layout">
        <nav className="platform-list" aria-label="平台列表">
          <div className="platform-list-heading">平台列表 <span>{links.length}</span></div>
          {links.map((link, index) => <Button key={index} type="button" variant="ghost" className="platform-list-item" aria-current={index === selected ? 'true' : undefined} onClick={() => setSelected(index)}>
            {index < platforms.length && platformLogos[platforms[index]] ? <img src={platformLogos[platforms[index]]} alt="" width={23} height={23} /> : <span className="platform-list-placeholder" aria-hidden="true">{(link.name.trim() || '新').slice(0, 1)}</span>}
            <span className="platform-list-name">{link.name.trim() || '新平台'}</span>{link.enabled === false && <small>已停用</small>}
          </Button>)}
          <Button type="button" size="sm" className="platform-add" disabled={links.length >= 100} onClick={() => { editLinks([...links, { name: '', url: '' }]); setSelected(links.length) }}>添加平台</Button>
        </nav>
        {item && <div className="platform-editor">
          <div className="platform-editor-header"><div className="platform-editor-title"><h2>{item.name.trim() || '新平台'}</h2><span className="platform-type">{builtIn ? '内置平台' : '自定义平台'}</span></div>
            {!builtIn && <Button type="button" variant="outline" size="sm" className="platform-delete" onClick={() => { editLinks(links.filter((_, index) => index !== selected)); setSelected(Math.max(0, selected - 1)) }}>删除平台</Button>}
          </div>
          <div className="platform-editor-body">
            <div className="platform-basics"><div className="platform-section-heading"><h3>基础设置</h3><Label className="create-images-choice"><Checkbox checked={item.enabled !== false} onCheckedChange={checked => update({ enabled: checked === true })}/>启用平台</Label></div>
            {!builtIn && <Label className="platform-link-field"><span>平台名称</span><Input value={item.name} maxLength={50} aria-invalid={!item.name.trim() || !!duplicate} onChange={event => update({ name: event.target.value })}/>{(!item.name.trim() || duplicate) && <small role="alert">请输入不重复的平台名称。</small>}</Label>}
            <Label className="platform-link-field"><span>打开链接</span><Input value={item.url} type="url" placeholder="https://…" autoComplete="off" spellCheck={false} aria-invalid={!validPlatformUrl(item.url.trim())} onChange={event => update({ url: event.target.value })}/>{!validPlatformUrl(item.url.trim()) && <small role="alert">请输入有效的 HTTP 或 HTTPS 链接。</small>}</Label>
            </div>
            {platform && <TooltipProvider><div className="platform-rules"><div className="platform-section-heading"><h3>生成规则</h3></div>
              <div className="platform-rule"><div className="platform-rule-heading"><Label htmlFor="platform-body-rule">正文生成规则</Label><div className="platform-rule-actions"><PlatformPromptTest key={`${platform}-body`} platform={platform} kind="body" rule={bodyRules[platform]} body={testBodies[platform] ?? exampleBody} onBody={value => setTestBodies(all => ({ ...all, [platform]: value }))}/><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" type="button" aria-label="恢复默认正文生成规则" onClick={() => { setBodyRules(all => ({ ...all, [platform]: defaultPlatformPrompts[platform] })); setDirty(true) }}><Icon name="refresh" size={15}/></Button></TooltipTrigger><TooltipContent>恢复默认</TooltipContent></Tooltip></div></div><Textarea id="platform-body-rule" value={bodyRules[platform]} maxLength={4000} rows={9} onChange={event => { setBodyRules(all => ({ ...all, [platform]: event.target.value })); setDirty(true) }}/></div>
              <div className="platform-rule"><div className="platform-rule-heading"><Label htmlFor="platform-title-rule">标题生成规则</Label><div className="platform-rule-actions"><PlatformPromptTest key={`${platform}-title`} platform={platform} kind="title" rule={titleRules[platform]} body={testBodies[platform] ?? exampleBody} onBody={value => setTestBodies(all => ({ ...all, [platform]: value }))}/><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" type="button" aria-label="恢复默认标题生成规则" onClick={() => { setTitleRules(all => ({ ...all, [platform]: defaultTitlePrompts[platform] })); setDirty(true) }}><Icon name="refresh" size={15}/></Button></TooltipTrigger><TooltipContent>恢复默认</TooltipContent></Tooltip></div></div><Textarea id="platform-title-rule" value={titleRules[platform]} maxLength={4000} rows={4} onChange={event => { setTitleRules(all => ({ ...all, [platform]: event.target.value })); setDirty(true) }}/></div>
            </div></TooltipProvider>}
          </div>
        </div>}
      </div>
    </form>}
  </section>
}
