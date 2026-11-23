import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useRef } from 'react'
import type { Draft, Platform } from '../../../shared/drafts'
import type { ImageStyle } from '../../../shared/image-styles'
import type { OpenDocument } from './types'
import { VisualEditor } from './VisualEditor'
import { ResearchPanel } from './ResearchPanel'
import { Icon } from '../components/Icon'
import { ImageGallery } from './ImageGallery'
import { TitleGenerator } from './TitleGenerator'

export function Detail({ platformTitle, onPlatformTitleChange, draft, selectedPlatform, document, editorBusy, onImageBusy, onDocumentChange, onRegenerate, regenerating, imageStyle, onStyleSave }: { platformTitle: string | null; onPlatformTitleChange: (value: string) => void; draft: Draft; selectedPlatform: Platform; document: OpenDocument; editorBusy: boolean; onImageBusy: (busy: boolean) => void; imageStyle: ImageStyle; onStyleSave: (style: ImageStyle) => Promise<string | null>; onDocumentChange: (value: string) => void; onRegenerate: () => void; regenerating: boolean }) {
  const toolsRef = useRef<HTMLElement>(null)
  const key = `${draft.id}:${selectedPlatform}`
  return <div className="note-detail">
    <div className="note-heading studio-hero article-platform-heading"><TitleGenerator key={key} draft={draft} platform={selectedPlatform} title={platformTitle} document={document} busy={editorBusy} onBusy={onImageBusy} onApply={onPlatformTitleChange}/><h1><Input appearance="embedded" className="article-title-input" aria-label={`${selectedPlatform}文章标题`} placeholder="输入文章标题" maxLength={500} value={platformTitle ?? ''} disabled={editorBusy || platformTitle === null} onChange={event => onPlatformTitleChange(event.target.value)} /></h1></div>
    <div className="detail-columns"><div className="detail-content"><Card asChild><section className="note-document" aria-label={`${selectedPlatform}文案`}><div className="note-document-toolbar"><div className="document-actions"><Button type="button" variant="secondary" className="article-optimize-trigger" disabled={editorBusy} onClick={onRegenerate}><Icon name="spark" size={15}/>{regenerating ? '生成中…' : '重新生成'}</Button></div></div><VisualEditor key={key} initialMarkdown={document.content} onBusyChange={onImageBusy} onChange={onDocumentChange} disabled={editorBusy}/></section></Card></div><aside className="article-tools" ref={toolsRef} tabIndex={-1} aria-label="文章配图和核查"><ImageGallery key={key} draft={draft} platform={selectedPlatform} document={document} busy={editorBusy} imageStyle={imageStyle} onStyleSave={onStyleSave} /><ResearchPanel key={`${key}:${document.version}`} draftId={draft.id} platform={selectedPlatform} /></aside></div>
  </div>
}
