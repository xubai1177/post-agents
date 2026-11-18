import { useEffect, useRef, useState } from 'react'
import { zh } from '@blocknote/core/locales'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'

export function VisualEditor({ initialMarkdown, onChange, onBusyChange }: { initialMarkdown: string; onChange: (markdown: string) => void; onBusyChange: (busy: boolean) => void }) {
  const editor = useCreateBlockNote({ dictionary: zh })
  const initialValue = useRef(initialMarkdown).current
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const readyRef = useRef(false)
  useEffect(() => {
    let cancelled = false
    onBusyChange(true)
    async function load() {
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(initialValue)
        if (cancelled) return
        editor.replaceBlocks(editor.document, blocks)
        readyRef.current = true
        setReady(true)
      } catch {
        if (!cancelled) setError('无法加载文案，请重新读取后重试。')
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
      onChange(editor.blocksToMarkdownLossy(editor.document))
    } catch {
      setError('文案转换失败，请继续编辑后重试。')
    }
  }
  return <div className="visual-editor">{error && <p className="error" role="alert">{error}</p>}{!ready && !error && <p className="editor-loading">正在加载编辑器…</p>}<div hidden={!ready}><BlockNoteView editor={editor} onChange={handleChange} theme="light" /></div></div>
}
