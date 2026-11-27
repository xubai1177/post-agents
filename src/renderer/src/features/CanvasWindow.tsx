import { useEffect } from 'react'
import { resolveAppearance } from './appearance'
import { themePresetForColor } from '../../../shared/settings'
import { WhiteboardCanvas } from './WhiteboardCanvas'

/** Standalone renderer: use the same saved appearance as the main workbench. */
export function CanvasWindow() {
  useEffect(() => {
    let active = true
    const system = window.matchMedia('(prefers-color-scheme: dark)')
    const refresh = async () => {
      const result = await window.canvasApi.appearance()
      if (!active || !result.ok) return
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
  return <WhiteboardCanvas onBack={async () => { const result = await window.canvasApi.close(); if (!result.ok) throw new Error(result.error) }} onBusy={() => {}}/>
}
