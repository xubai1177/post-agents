import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { useEffect, useId, useState } from 'react'
import { observeImageStyles } from './image-style-events'
import type { Platform } from '../../../shared/drafts'
import { defaultPlatformImageStyles, imageStylePreview, isImageStyle, type ImageStyle, type ImageStyleDefinition } from '../../../shared/image-styles'

export function ImageStylePicker({ value, onChange, platform = '小红书', disabled = false, reloadKey }: { value: ImageStyle; onChange: (value: ImageStyle) => void; platform?: Platform; disabled?: boolean; reloadKey?: boolean }) {
  const labelId = useId()
  const [styles, setStyles] = useState<ImageStyleDefinition[]>(() => defaultPlatformImageStyles()[platform])
  const [error, setError] = useState('')
  useEffect(() => {
    setStyles(defaultPlatformImageStyles()[platform]); setError('')
    return observeImageStyles(window, platform, () => window.settingsApi.load(), setStyles, setError)
  }, [platform, reloadKey])
  return <fieldset className="image-style-picker" disabled={disabled}>
    <legend id={labelId}>图片风格</legend>
    <RadioGroup className="image-style-options" aria-labelledby={labelId} value={value} disabled={disabled}
      onValueChange={style => { if (isImageStyle(style)) onChange(style) }}>
      {styles.map(style => <Label className="image-style-choice" key={style.id}>
        <RadioGroupItem className="sr-only" value={style.id} aria-label={style.name}/>
        <span className="image-style-card">{imageStylePreview(style) ? <img src={imageStylePreview(style)} width={360} height={480} alt=""/> : <span className="image-style-placeholder">暂无预览</span>}<span>{style.name}</span></span>
      </Label>)}
    </RadioGroup>
    {error ? <small role="alert">{error}</small> : !styles.some(style => style.id === value) ? <small role="alert">所选风格已不存在，请重新选择。</small> : <small>图片仅为风格示意，生成效果以实际结果为准。</small>}
  </fieldset>
}
