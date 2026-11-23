import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { useId } from 'react'
import { imageStyles, imageStyleLabels, isImageStyle, type ImageStyle } from '../../../shared/image-styles'

function StylePreview({ style }: { style: ImageStyle }) {
  if (style === 'flat') return <svg viewBox="0 0 160 110" aria-hidden="true"><rect width="160" height="110" fill="#f7e9db"/><circle cx="124" cy="26" r="15" fill="#edaa83"/><path d="M0 82 39 49l31 22 30-34 60 52v21H0z" fill="#9bb9ac"/><path d="M0 95 42 72l32 16 33-20 53 28v14H0z" fill="#4e746d"/><rect x="16" y="15" width="58" height="7" rx="3.5" fill="#405854"/><rect x="16" y="28" width="40" height="4" rx="2" fill="#84958a"/></svg>
  if (style === 'handdrawn') return <svg viewBox="0 0 160 110" aria-hidden="true"><rect width="160" height="110" fill="#f6f0df"/><path d="M7 89Q24 77 38 54q13 14 26 22 17-23 33-38 29 28 55 52" fill="#c4d4b6" stroke="#575c4f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 89q22-9 40 1t39-2q29-12 66 4M20 20q19-3 45 1M20 29q17-1 31 1" fill="none" stroke="#5c6154" strokeWidth="2" strokeLinecap="round"/><circle cx="123" cy="24" r="13" fill="#edc78f" stroke="#665e51" strokeWidth="1.5"/><path d="m116 23 6 2 6-2" fill="none" stroke="#665e51"/></svg>
  if (style === 'watercolor') return <svg viewBox="0 0 160 110" aria-hidden="true"><rect width="160" height="110" fill="#f8f5ed"/><ellipse cx="108" cy="56" rx="37" ry="30" fill="#c5d9cf" opacity=".7"/><ellipse cx="122" cy="38" rx="24" ry="25" fill="#e6c1b2" opacity=".65"/><ellipse cx="83" cy="73" rx="39" ry="21" fill="#b9c9dc" opacity=".7"/><ellipse cx="115" cy="81" rx="31" ry="17" fill="#ddcda5" opacity=".55"/><path d="M17 24h47M17 34h32" stroke="#756d6b" strokeWidth="3" strokeLinecap="round"/><path d="M16 86q29-5 52 2" stroke="#a3aaa0" strokeWidth="2" fill="none"/></svg>
  return <svg viewBox="0 0 160 110" aria-hidden="true"><rect width="160" height="110" fill="#f1f4f5"/><rect x="17" y="16" width="54" height="6" rx="3" fill="#273e4b"/><rect x="17" y="29" width="35" height="4" rx="2" fill="#94a3aa"/><rect x="17" y="51" width="56" height="42" rx="4" fill="#dce7e8"/><circle cx="45" cy="72" r="12" fill="#6d9694"/><rect x="85" y="50" width="54" height="6" rx="3" fill="#4b6975"/><rect x="85" y="63" width="43" height="4" rx="2" fill="#9eafb5"/><rect x="85" y="74" width="50" height="4" rx="2" fill="#9eafb5"/><rect x="85" y="85" width="32" height="4" rx="2" fill="#9eafb5"/></svg>
}

export function ImageStylePicker({ value, onChange, disabled = false }: { value: ImageStyle; onChange: (value: ImageStyle) => void; disabled?: boolean }) {
  const labelId = useId()
  return <fieldset className="image-style-picker" disabled={disabled}>
    <legend id={labelId}>图片风格</legend>
    <RadioGroup className="image-style-options" aria-labelledby={labelId} value={value} disabled={disabled}
      onValueChange={style => { if (isImageStyle(style)) onChange(style) }}>
      {imageStyles.map(style => <Label className="image-style-choice" key={style}>
        <RadioGroupItem className="sr-only" value={style} aria-label={imageStyleLabels[style]}/>
        <span className="image-style-card"><StylePreview style={style}/><span>{imageStyleLabels[style]}</span></span>
      </Label>)}
    </RadioGroup>
    <small>图片仅为风格示意，生成效果以实际结果为准。</small>
  </fieldset>
}
