import type { Platform } from '../../../shared/drafts'
import { defaultPlatformImageStyles, type ImageStyleDefinition, type PlatformImageStyles } from '../../../shared/image-styles'
import type { Result } from '../../../shared/settings'

export const imageStylesChangedEvent = 'post-agents:image-styles-changed'

export function notifyImageStylesChanged(): void {
  window.dispatchEvent(new Event(imageStylesChangedEvent))
}

export function observeImageStyles(
  target: EventTarget,
  platform: Platform,
  loadSettings: () => Promise<Result<{ platformImageStyles?: PlatformImageStyles }>>,
  onStyles: (styles: ImageStyleDefinition[]) => void,
  onError: (message: string) => void
): () => void {
  let active = true
  let sequence = 0
  function load() {
    const request = ++sequence
    void Promise.resolve().then(loadSettings).then(result => {
      if (!active || request !== sequence) return
      if (result.ok) { onStyles((result.value.platformImageStyles ?? defaultPlatformImageStyles())[platform]); onError('') }
      else onError(result.error)
    }).catch(() => { if (active && request === sequence) onError('无法读取图片风格，请重新打开。') })
  }
  target.addEventListener(imageStylesChangedEvent, load)
  load()
  return () => { active = false; target.removeEventListener(imageStylesChangedEvent, load) }
}
