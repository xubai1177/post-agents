import { useEffect } from 'react'
import { defaultAccentColor, defaultPanelOpacity, themePresetForColor, type AppearanceMode } from '../../../shared/settings'

export function resolveAppearance(mode: AppearanceMode, systemDark: boolean): 'light' | 'dark' {
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
}

export function useAppearance(): void {
  useEffect(() => {
    let color: string = defaultAccentColor
    let panelOpacity = defaultPanelOpacity
    let revision = 0
    function apply() {
      const root = document.documentElement
      root.dataset.theme = 'light'
      root.dataset.palette = themePresetForColor(color)?.id ?? 'custom'
      root.style.setProperty('--brand', color)
      root.style.setProperty('--panel-opacity', `${panelOpacity}%`)
    }
    async function refresh() {
      const request = ++revision
      try {
        const result = await window.settingsApi.load()
        if (request !== revision || !result.ok) return
        color = result.value.accentColor
        panelOpacity = result.value.panelOpacity
        apply()
      } catch { /* Keep the current appearance if settings cannot be read. */ }
    }
    apply()
    window.addEventListener('appearance-saved', refresh)
    void refresh()
    return () => {
      revision++
      window.removeEventListener('appearance-saved', refresh)
    }
  }, [])
}
