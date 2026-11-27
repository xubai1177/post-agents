import { useEffect, useState } from 'react'
import { resolveAppearance } from './appearance'
import { themePresetForColor } from '../../../shared/settings'
import { Whiteboard } from './Whiteboard'

const updateWindowState = (busy: boolean, dirty: boolean) => window.videoWindowApi.setState(busy, dirty)

export function VideoWindow() {
  const [workspaceName, setWorkspaceName] = useState('')
  useEffect(() => {
    let active = true
    const system = window.matchMedia('(prefers-color-scheme: dark)')
    const refresh = async () => {
      const result = await window.videoWindowApi.appearance()
      if (!active || !result.ok) return
      setWorkspaceName(result.value.workspaceName)
      const root = document.documentElement
      root.dataset.theme = resolveAppearance(result.value.appearance, system.matches)
      root.dataset.palette = themePresetForColor(result.value.accentColor)?.id ?? 'custom'
      root.style.setProperty('--brand', result.value.accentColor)
      root.style.setProperty('--panel-opacity', `${result.value.panelOpacity}%`)
    }
    const update = () => { void refresh().catch(() => {}) }
    update(); system.addEventListener('change', update); window.addEventListener('focus', update)
    return () => { active = false; system.removeEventListener('change', update); window.removeEventListener('focus', update) }
  }, [])
  return <div className="whiteboard-video-window"><header className="whiteboard-video-titlebar"><strong>白板视频</strong>{workspaceName && <span>工作区 · {workspaceName}</span>}</header><main><Whiteboard onBusy={updateWindowState}/></main></div>
}
