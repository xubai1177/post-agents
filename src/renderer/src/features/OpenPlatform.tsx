import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Icon } from '../components/Icon'
import type { Platform } from '../../../shared/drafts'
import { useMessage } from '../components/MessageProvider'

export function OpenPlatform({ selectedPlatform }: { selectedPlatform: Platform }) {
  const showMessage = useMessage()
  async function open() {
    try {
      const result = await window.settingsApi.openPlatform(selectedPlatform)
      if (result.ok) return
    } catch { /* Report the same actionable error for IPC failures. */ }
    showMessage(`无法打开${selectedPlatform}，请检查平台是否启用及链接配置。`, true)
  }
  const label = `打开${selectedPlatform}`
  return <TooltipProvider><Tooltip><TooltipTrigger asChild><Button type="button" size="icon-sm" variant="outline" className="article-platform-trigger" aria-label={label} onClick={() => void open()}><Icon name="external" size={16}/></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip></TooltipProvider>
}
