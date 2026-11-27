import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { AlertCircle, ArrowDownToLine, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react'
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
  const hasUpdate = state?.version && ['available', 'downloading', 'downloaded', 'installing'].includes(state.status) || state?.errorStage === 'download'
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
    <DialogContent className="update-dialog flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[460px]" showCloseButton={false}>
      <div className="flex items-center gap-3 px-6 pt-6 pb-5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ArrowDownToLine size={20} aria-hidden="true" /></div>
        <div className="min-w-0 space-y-2"><DialogTitle className="text-base leading-5">发现新版本</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 text-xs"><span>当前版本 v{state.currentVersion}</span><ArrowRight size={13} aria-hidden="true" /><span className="font-semibold text-primary">v{state.version}</span></DialogDescription></div>
      </div>
      {state.notes && <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pb-5"><div className="rounded-lg bg-muted/50 px-4 py-3.5"><h3 className="mb-2 text-xs font-semibold text-muted-foreground">更新内容</h3><div className="update-release-notes text-sm leading-6 text-foreground break-words"><ReactMarkdown skipHtml disallowedElements={['a', 'img']} unwrapDisallowed>{state.notes}</ReactMarkdown></div></div></div>}
      {state.status === 'downloading' && <div className="px-6 pb-5 text-sm" aria-live="polite"><div className="flex items-center justify-between gap-3"><label htmlFor="update-progress" className="font-medium">正在下载更新</label><span className="text-xs font-semibold text-primary tabular-nums">{state.progress ?? 0}%</span></div><progress id="update-progress" className="update-progress mt-2.5" max={100} value={state.progress ?? 0}/></div>}
      {state.status === 'downloaded' && <div className="flex items-center gap-2 px-6 pb-5 text-xs text-muted-foreground" role="status"><CheckCircle2 className="text-primary" size={15} aria-hidden="true" />更新已下载，可以重启安装</div>}
      {state.status === 'installing' && <div className="px-6 pb-5 text-xs text-muted-foreground" role="status">正在验证更新，请稍候…</div>}
      {state.status === 'error' && state.errorStage === 'download' && <div className="flex items-start gap-2 px-6 pb-5 text-xs leading-5 text-destructive" role="alert"><AlertCircle className="mt-0.5 shrink-0" size={15} aria-hidden="true" /><span>{state.error ?? '下载更新失败，请重试。'}</span></div>}
      <DialogFooter className="border-t bg-muted/20 px-6 py-4"><Button variant="outline" onClick={() => updates.setOpen(false)}>稍后</Button>
        {state.status === 'downloaded' ? <Button onClick={() => void updates.action('install')}><RefreshCw size={14} aria-hidden="true" />重启更新</Button> :
          <Button disabled={state.status !== 'error'} onClick={() => void updates.action('download')}>{state.status === 'error' ? '重试下载' : state.status === 'installing' ? '正在验证…' : '正在下载…'}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
