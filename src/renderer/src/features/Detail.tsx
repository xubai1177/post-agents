import type { Draft, Platform } from '../../../shared/drafts'
import type { OpenDocument } from './types'
import { Icon } from '../components/Icon'
import { VisualEditor } from './VisualEditor'
import { ResearchPanel } from './ResearchPanel'
import { ImageGallery } from './ImageGallery'

export function Detail({ draft, selectedPlatform, onPlatform, document, editorBusy, onBusyChange, onSave, onReload, onImageBusy, onDocumentChange }: { draft: Draft; selectedPlatform: Platform; onPlatform: (p: Platform) => void; document: OpenDocument; editorBusy: boolean; onBusyChange: (busy: boolean) => void; onSave: () => void; onReload: () => void; onImageBusy: (busy: boolean) => void; onDocumentChange: (value: string) => void }) {
  const key = `${draft.id}:${selectedPlatform}`
  return <div className="note-detail"><div className="note-heading"><div className="eyebrow"><span/> 内容草稿</div><h1>{draft.title}</h1><p>本地草稿 · 文案需自行核查事实与来源</p></div><div className="note-tabs" role="group" aria-label="平台版本">{draft.platforms.map((platform) => <button type="button" key={platform} disabled={editorBusy} aria-pressed={selectedPlatform === platform} className={selectedPlatform === platform ? 'active' : ''} onClick={() => onPlatform(platform)}>{platform}</button>)}</div>
  <div className="detail-columns"><div className="detail-content"><section className="note-document" aria-label={`${selectedPlatform}文案`}><div className="note-document-toolbar"><div><strong>发布文案</strong><span>{document.content === document.savedContent ? '已保存' : '未保存'}</span></div><div className="document-actions"><button type="button" className="reload-button" disabled={editorBusy} onClick={onReload}>重新读取</button><button type="button" className="primary-button" disabled={editorBusy || document.content === document.savedContent} onClick={onSave}>保存</button></div></div><div className="document-notice"><Icon name="spark" size={15}/> 编辑可能调整文案格式；生成结果需人工核查事实与来源。</div><VisualEditor key={key} initialMarkdown={document.content} onBusyChange={onBusyChange} onChange={onDocumentChange} /></section><ResearchPanel key={draft.id} draftId={draft.id} /></div><ImageGallery key={key} draft={draft} platform={selectedPlatform} document={document} busy={editorBusy} onBusy={onImageBusy} /></div></div>
}
