import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useRef } from 'react'
import type { Draft, Platform } from '../../../shared/drafts'
import type { ImageStyle } from '../../../shared/image-styles'
import type { OpenDocument } from './types'
import { VisualEditor } from './VisualEditor'
import { ResearchPanel } from './ResearchPanel'
import { Icon } from '../components/Icon'
import { ImageGallery } from './ImageGallery'
import { TitleGenerator } from './TitleGenerator'
import { OpenPlatform } from './OpenPlatform'
import { platformLogos } from './platform-logos'

export function Detail({ platformTitle, onPlatformTitleChange, draft, selectedPlatform, document, editorBusy, onImageBusy, onDocumentChange, onRegenerate, regenerating, imageStyle, onStyleSave }: { platformTitle: string | null; onPlatformTitleChange: (value: string) => void; draft: Draft; selectedPlatform: Platform; document: OpenDocument; editorBusy: boolean; onImageBusy: (busy: boolean) => void; imageStyle: ImageStyle; onStyleSave: (style: ImageStyle) => Promise<string | null>; onDocumentChange: (value: string) => void; onRegenerate: () => void; regenerating: boolean }) {
  const toolsRef = useRef<HTMLElement>(null)
  const key = `${draft.id}:${selectedPlatform}`
  return <div className="note-detail">
    <div className="detail-columns"><div className="detail-content"><Card asChild><section className="note-document" aria-label={`${selectedPlatform}文案`}><div className="article-detail-header"><div className="article-detail-title"><img className="article-platform-logo" src={platformLogos[selectedPlatform]} alt="" aria-hidden="true"/><h1><Input appearance="embedded" className="article-title-input" aria-label={`${selectedPlatform}文章标题`} placeholder="输入文章标题" maxLength={500} value={platformTitle ?? ''} disabled={editorBusy || platformTitle === null} onChange={event => onPlatformTitleChange(event.target.value)} /></h1></div><div className="article-detail-actions"><TooltipProvider><TitleGenerator key={key} draft={draft} platform={selectedPlatform} title={platformTitle} document={document} busy={editorBusy} onBusy={onImageBusy} onApply={onPlatformTitleChange}/><Tooltip><TooltipTrigger asChild><Button type="button" variant="outline" size="icon-sm" className="article-optimize-trigger" disabled={editorBusy} aria-label={regenerating ? '文章生成中' : '重新生成文章'} aria-busy={regenerating} onClick={onRegenerate}><Icon name={regenerating ? 'loading' : 'refresh'} size={16} className={regenerating ? 'animate-spin motion-reduce:animate-none' : undefined}/></Button></TooltipTrigger><TooltipContent>重新生成文章</TooltipContent></Tooltip></TooltipProvider><OpenPlatform selectedPlatform={selectedPlatform}/></div></div><VisualEditor key={key} initialMarkdown={document.content} onBusyChange={onImageBusy} onChange={onDocumentChange} disabled={editorBusy}/></section></Card></div><aside className="article-tools" ref={toolsRef} tabIndex={-1} aria-label="文章配图和核查"><ImageGallery key={key} draft={draft} platform={selectedPlatform} document={document} busy={editorBusy} imageStyle={imageStyle} onStyleSave={onStyleSave} /><ResearchPanel key={`${key}:${document.version}`} draftId={draft.id} platform={selectedPlatform} /></aside></div>
  </div>
}
