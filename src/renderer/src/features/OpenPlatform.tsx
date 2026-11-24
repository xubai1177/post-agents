import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Icon } from '../components/Icon'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Platform } from '../../../shared/drafts'
import type { PlatformLink } from '../../../shared/platform-links'
import { useMessage } from '../components/MessageProvider'

export function OpenPlatform({ selectedPlatform }: { selectedPlatform: Platform }) {
  const [links, setLinks] = useState<PlatformLink[]>([])
  const [loading, setLoading] = useState(true)
  const showMessage = useMessage()
  useEffect(() => {
    let active = true
    void window.settingsApi.load().then(result => {
      if (!active) return
      if (result.ok) setLinks(result.value.platformLinks)
      else showMessage(result.error, true)
    }).catch(() => { if (active) showMessage('无法读取平台配置。', true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [showMessage])
  const available = links.filter(link => link.enabled !== false && link.url).sort((a, b) => Number(b.name === selectedPlatform) - Number(a.name === selectedPlatform))
  async function open(name: string) {
    try {
      const result = await window.settingsApi.openPlatform(name)
      if (!result.ok) showMessage('无法打开平台链接，请检查设置。', true)
    } catch { showMessage('无法打开平台链接，请检查设置。', true) }
  }
  return <DropdownMenu><TooltipProvider><Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild><Button type="button" size="icon-sm" variant="outline" className="article-platform-trigger" aria-label="打开平台" disabled={loading}><Icon name="external" size={16}/></Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent>打开平台</TooltipContent></Tooltip></TooltipProvider>
    <DropdownMenuContent align="end">
      {available.length ? available.map(link => <DropdownMenuItem key={link.name} onSelect={() => void open(link.name)}>{link.name}</DropdownMenuItem>) :
        <DropdownMenuItem disabled>请先在平台配置中添加链接</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>
}
