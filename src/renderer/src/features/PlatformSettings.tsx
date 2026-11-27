import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { defaultPlatformImageStyles, imageStylePreview, imageStyles, isPlatformImageStyles, type ImageStyleDefinition } from '../../../shared/image-styles'
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
import { useConfirmDialog } from '../components/ConfirmDialog'
import { platformLogos } from './platform-logos'
import { PlatformPromptTest } from './PlatformPromptTest'
import { notifyImageStylesChanged } from './image-style-events'

export function PlatformSettings({ onSaved }: { onSaved: (links: PlatformLink[]) => void }) {
  const showMessage = useMessage()
  const { confirm, confirmation } = useConfirmDialog()
  const [links, setLinks] = useState<PlatformLink[]>(defaultPlatformLinks)
  const [bodyRules, setBodyRules] = useState(() => resolvePlatformPrompts())
  const [titleRules, setTitleRules] = useState(() => resolveTitlePrompts())
  const [selected, setSelected] = useState(0)
  const [styleLists, setStyleLists] = useState(defaultPlatformImageStyles)
  const [testing, setTesting] = useState(false)
  const [savingPreview, setSavingPreview] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [candidate, setCandidate] = useState<{ platform: Platform; id: string; prompt: string; image: string } | null>(null)
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
      setStyleLists(result.value.platformImageStyles ?? defaultPlatformImageStyles())
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
  function editStyle(platform: Platform, id: string, change: Partial<ImageStyleDefinition>) {
    setStyleLists(all => ({ ...all, [platform]: all[platform].map(style => style.id === id ? { ...style, ...change } : style) }))
    setDirty(true)
  }
  async function testStyle(platform: Platform, style: ImageStyleDefinition) {
    if (testing || !style.prompt.trim()) return
    setTesting(true); setPreviewError('')
    try {
      const result = await window.settingsApi.testImageStyle({ platform, prompt: style.prompt })
      if (result.ok) setCandidate({ platform, id: style.id, prompt: style.prompt, image: result.value })
      else showMessage(result.error, true)
    } catch { showMessage('测试图片生成失败，请检查图片服务。', true) }
    finally { setTesting(false) }
  }
  async function applyPreview() {
    if (!candidate || savingPreview) return
    const current = styleLists[candidate.platform].find(style => style.id === candidate.id)
    if (!current || current.prompt !== candidate.prompt) { setPreviewError('提示词已修改，请重新测试。'); return }
    if (!current.name.trim()) { setPreviewError('请先关闭测试窗口并填写风格名称。'); return }
    setSavingPreview(true); setPreviewError('')
    try {
      const result = await window.settingsApi.saveImageStylePreview({ platform: candidate.platform, style: { ...current, preview: candidate.image } })
      if (!result.ok) { setPreviewError(result.error); return }
      setStyleLists(all => ({ ...all, [candidate.platform]: all[candidate.platform].map(style => style.id === candidate.id ? { ...style, preview: candidate.image } : style) }))
      notifyImageStylesChanged()
      setCandidate(null)
      showMessage(dirty ? '预览图已保存；其他修改请保存配置。' : '风格预览图已保存。')
    } catch { setPreviewError('保存预览图失败，请重试。') }
    finally { setSavingPreview(false) }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    const normalized = links.map(link => ({ name: link.name.trim(), url: link.url.trim(), enabled: link.enabled !== false }))
    if (!validPlatformLinks(normalized)) { setError('请检查各平台的名称和链接。'); return }
    if (Object.values(styleLists).some(items => items.some(style => !style.name.trim() || !style.prompt.trim()))) { setError('请填写每个图片风格的名称和提示词。'); return }
    if (!isPlatformImageStyles(styleLists)) { setError('图片风格配置过大或无效，请减少预览图后重试。'); return }
    setSaving(true); setError('')
    try {
      const result = await window.settingsApi.savePlatformConfig({ platformLinks: normalized, platformPrompts: bodyRules, titlePrompts: titleRules, platformImageStyles: styleLists })
      if (!result.ok) { showMessage(result.error, true); return }
      setLinks(result.value.platformLinks)
      setBodyRules(resolvePlatformPrompts(result.value.platformPrompts))
      setTitleRules(resolveTitlePrompts(result.value.titlePrompts))
      setStyleLists(result.value.platformImageStyles)
      setDirty(false)
      onSaved(result.value.platformLinks)
      notifyImageStylesChanged()
      showMessage('平台配置已保存。')
    } catch { showMessage('保存失败，请重试。', true) } finally { setSaving(false) }
  }

  return <section className="platform-page page-wrap">
    <header className="platform-page-header"><h1>平台配置</h1><Button type="submit" form="platform-settings-form" size="sm" disabled={loading || saving || savingPreview || !dirty}>{saving ? '保存中…' : '保存配置'}</Button></header>
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
              <section className="platform-image-styles" aria-label={`${platform}图片风格`}>
                <div className="platform-section-heading"><h3>图片风格</h3><Button type="button" size="sm" variant="outline" disabled={styleLists[platform].length >= 30} onClick={() => { setStyleLists(all => ({ ...all, [platform]: [...all[platform], { id: crypto.randomUUID(), name: '', prompt: '' }] })); setDirty(true) }}><Icon name="plus" size={14}/> 添加风格</Button></div>
                <small className="platform-image-style-help">测试使用图片生成服务，可能产生费用。修改后请保存配置。</small>
                {testing && <p role="status">正在生成测试封面…</p>}
                {styleLists[platform].map(style => <div className="platform-image-style" key={style.id}>
                  <div className="platform-image-style-preview">{imageStylePreview(style) ? <img src={imageStylePreview(style)} width={96} height={128} alt=""/> : <span>暂无预览</span>}</div>
                  <div className="platform-image-style-fields"><div className="platform-rule-heading"><Label htmlFor={`style-name-${style.id}`}>风格名称</Label><div className="platform-rule-actions"><Button type="button" variant="ghost" size="icon-sm" aria-label={`测试${style.name || '新风格'}图片提示词`} title="测试生成效果" disabled={testing || !style.prompt.trim()} onClick={() => void testStyle(platform, style)}><Icon name={testing ? 'loading' : 'spark'} size={15}/></Button>{!imageStyles.some(id => id === style.id) && <Button type="button" variant="ghost" size="icon-sm" aria-label={`删除${style.name || '新风格'}`} title="删除风格" onClick={() => void (async () => { if (!await confirm({ title: '删除图片风格', message: '已选择此风格的文章需要重新选择风格。', action: '删除' })) return; setStyleLists(all => ({ ...all, [platform]: all[platform].filter(item => item.id !== style.id) })); setDirty(true) })()}><Icon name="trash" size={15}/></Button>}</div></div>
                    <Input id={`style-name-${style.id}`} value={style.name} maxLength={50} aria-invalid={!style.name.trim()} onChange={event => editStyle(platform, style.id, { name: event.target.value })}/>
                    <Label htmlFor={`style-prompt-${style.id}`}>图片风格提示词</Label><Textarea id={`style-prompt-${style.id}`} value={style.prompt} maxLength={4000} aria-invalid={!style.prompt.trim()} rows={3} onChange={event => editStyle(platform, style.id, { prompt: event.target.value })}/>
                  </div>
                </div>)}
              </section>
            </div></TooltipProvider>}
          </div>
        </div>}
      </div>
    </form>}
    {confirmation}
    <Dialog open={!!candidate} onOpenChange={open => { if (!open && !savingPreview) setCandidate(null) }}><DialogContent showCloseButton={!savingPreview} onEscapeKeyDown={event => { if (savingPreview) event.preventDefault() }} onInteractOutside={event => { if (savingPreview) event.preventDefault() }}><DialogTitle>图片风格测试</DialogTitle><DialogDescription>使用当前提示词生成的示例封面，实际效果以图片服务返回为准。</DialogDescription>{candidate && <><img className="platform-image-test-result" src={candidate.image} width={360} height={480} alt="生成的风格测试封面"/>{previewError && <p role="alert">{previewError}</p>}<Button type="button" disabled={savingPreview} onClick={() => void applyPreview()}>{savingPreview ? '正在保存…' : '设为风格预览图'}</Button></>}</DialogContent></Dialog>
  </section>
}
