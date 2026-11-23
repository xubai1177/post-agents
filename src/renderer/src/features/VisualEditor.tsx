import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { zh } from '@blocknote/core/locales'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'

function subscribeAppearance(listener: () => void) {
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}
function getEditorAppearance() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function countText(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + countText(item), 0)
  if (!value || typeof value !== 'object') return 0
  const node = value as Record<string, unknown>
  if (typeof node.text === 'string') return Array.from(node.text.replace(/\s/gu, '')).length
  return countText(node.content) + countText(node.children) + countText(node.rows) + countText(node.cells)
}

export function VisualEditor({ initialMarkdown, onChange, onBusyChange, disabled }: { initialMarkdown: string; onChange: (markdown: string) => void; onBusyChange: (busy: boolean) => void; disabled: boolean }) {
  const theme = useSyncExternalStore(subscribeAppearance, getEditorAppearance)
  const editor = useCreateBlockNote({ dictionary: zh })
  const initialValue = useRef(initialMarkdown).current
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [characterCount, setCharacterCount] = useState(0)
  const readyRef = useRef(false)
  useEffect(() => {
    let cancelled = false
    onBusyChange(true)
    async function load() {
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(initialValue)
        if (cancelled) return
        editor.replaceBlocks(editor.document, blocks)
        setCharacterCount(countText(editor.document))
        readyRef.current = true
        setReady(true)
      } catch {
        if (!cancelled) setError('无法加载文案，请重新点击文章后重试。')
      } finally {
        if (!cancelled) onBusyChange(false)
      }
    }
    void load()
    return () => { cancelled = true; readyRef.current = false }
  }, [editor, initialValue, onBusyChange])
  function handleChange() {
    if (!readyRef.current) return
    try {
      setError('')
      setCharacterCount(countText(editor.document))
      onChange(editor.blocksToMarkdownLossy(editor.document))
    } catch {
      setError('文案转换失败，请继续编辑后重试。')
    }
  }
  return <div className="visual-editor">{error && <p className="error" role="alert">{error}</p>}{!ready && !error && <p className="editor-loading">正在加载编辑器…</p>}<div hidden={!ready}><BlockNoteView editor={editor} onChange={handleChange} editable={!disabled} theme={theme} /></div>{ready && <div className="editor-character-count">{characterCount} 字</div>}</div>
}
