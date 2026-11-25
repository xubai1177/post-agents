import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { useMessage } from '../components/MessageProvider'
import type { UpdateState } from '../../../shared/updates'

export function useSoftwareUpdates() {
  const [state, setState] = useState<UpdateState>()
  const [open, setOpen] = useState(false)
  const manual = useRef(false)
  const dialogOpen = useRef(false)
  const announced = useRef('')
  const showMessage = useMessage()
  useEffect(() => {
    let active = true, received = false
    const accept = (next: UpdateState) => {
      setState(next)
      if (next.status === 'available' && (manual.current || announced.current !== next.version)) {
        announced.current = next.version ?? ''
        dialogOpen.current = true
        setOpen(true)
      }
      if (next.status === 'downloaded' && !dialogOpen.current) showMessage('更新已下载，可在设置中重启更新。')
      if (next.status === 'current' && manual.current) showMessage('灵稿 AI 已是最新版本。')
      if (next.status === 'error' && (manual.current || next.errorStage === 'download')) showMessage(next.error ?? '更新失败，请重试。', true)
    }
    const unsubscribe = window.updatesApi.onChanged(next => { received = true; accept(next) })
    void window.updatesApi.state().then(result => { if (active && !received && result.ok) accept(result.value) })
    return () => { active = false; unsubscribe() }
  }, [showMessage])
  async function check() {
    manual.current = true
    try { const result = await window.updatesApi.check(); if (!result.ok) showMessage(result.error, true) }
    catch { showMessage('检查更新失败，请重试。', true) }
    finally { manual.current = false }
  }
  async function action(name: 'download' | 'install' | 'openRelease') {
    try { const result = await window.updatesApi[name](); if (!result.ok) showMessage(result.error, true) }
    catch { showMessage('更新操作失败，请重试。', true) }
  }
  function changeOpen(value: boolean) { dialogOpen.current = value; setOpen(value) }
  return { state, open, setOpen: changeOpen, check, action }
}
type Controls = ReturnType<typeof useSoftwareUpdates>
export function UpdateSettings({ updates }: { updates: Controls }) {
  const { state } = updates
  const hasUpdate = state?.version && ['available', 'downloading', 'downloaded'].includes(state.status) || state?.errorStage === 'download'
  return <Card asChild><section className="form-card" id="settings-update">
    <h2>软件更新</h2><div className="flex items-center justify-between gap-3"><span>当前版本 v{state?.currentVersion ?? '—'}</span>
      <Button type="button" variant="outline" disabled={!state || state.status === 'checking'} onClick={() => hasUpdate ? updates.setOpen(true) : void updates.check()}>{hasUpdate ? '查看更新' : state?.status === 'checking' ? '正在检查…' : state?.status === 'error' ? '重试检查' : '检查更新'}</Button>
    </div>
  </section></Card>
}
export function UpdateDialog({ updates }: { updates: Controls }) {
  const { state } = updates
  if (!state?.version) return null
  return <Dialog open={updates.open} onOpenChange={updates.setOpen}>
    <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto" showCloseButton={false}>
      <DialogTitle>发现新版本 v{state.version}</DialogTitle>
      <DialogDescription>当前版本 v{state.currentVersion}</DialogDescription>
      {state.notes && <div className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-sm leading-relaxed break-words"><strong>更新内容</strong><ReactMarkdown skipHtml disallowedElements={['a', 'img']} unwrapDisallowed>{state.notes}</ReactMarkdown></div>}
      {state.status === 'downloading' && <div className="text-sm"><label htmlFor="update-progress">正在下载更新 {state.progress ?? 0}%</label><progress id="update-progress" className="mt-2 w-full accent-primary" max={100} value={state.progress ?? 0}/></div>}
      <DialogFooter><Button variant="outline" onClick={() => updates.setOpen(false)}>稍后</Button>
        {state.platform === 'mac' ? <Button onClick={() => void updates.action('openRelease')}>前往 GitHub 下载</Button> :
          state.status === 'downloaded' ? <Button onClick={() => void updates.action('install')}>重启更新</Button> :
            <Button disabled={state.status === 'downloading'} onClick={() => void updates.action('download')}>{state.status === 'error' ? '重试下载' : '下载更新'}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
