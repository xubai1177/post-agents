import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMessage } from '../components/MessageProvider'
import type { BackupExportProgress, WorkspaceMenuAction } from '../../../shared/workspace'

type Action = Exclude<WorkspaceMenuAction, 'open' | 'settings'>
export function WorkspaceManager({ action, onClose, onChanged, beforeSwitch }: { action: Action | null; onClose: () => void; onChanged: () => void; beforeSwitch: () => Promise<boolean> }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [exportProgress, setExportProgress] = useState<BackupExportProgress | null>(null)
  const showMessage = useMessage()
  useEffect(() => { setName(''); setPassword(''); setError(''); setExportProgress(null) }, [action])
  useEffect(() => window.workspaceApi.onExportProgress(setExportProgress), [])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!action || busy) return
    if (action !== 'create' && password.length > 0 && password.length < 8) { setError('密码至少需要 8 个字符，或留空。'); return }
    if (action !== 'export' && !name.trim()) { setError('请输入工作区名称。'); return }
    if (action !== 'export' && !await beforeSwitch()) return
    setBusy(true); setError(''); setExportProgress(null)
    try {
      if (action === 'export') {
        const result = await window.workspaceApi.exportBackup(password)
        if (!result.ok) setError(result.error)
        else if (result.value) { onClose(); showMessage(password ? '加密备份已保存，请妥善保管密码。' : '备份已保存。') }
      } else {
        const result = action === 'create' ? await window.workspaceApi.create(name.trim()) : await window.workspaceApi.importBackup(password, name.trim())
        if (!result.ok) setError(result.error)
        else if (result.value) { onClose(); onChanged() }
      }
    } catch { setError('工作区操作失败，请重试。') } finally { setBusy(false); setExportProgress(null) }
  }
  const title = action === 'create' ? '新建工作区' : action === 'import' ? '导入备份' : '导出备份'
  return <Dialog open={action !== null} onOpenChange={open => { if (!open && !busy) onClose() }}><DialogContent ref={dialogRef} className="workspace-dialog max-w-none sm:max-w-none" showCloseButton={!busy} onOpenAutoFocus={event => { event.preventDefault(); dialogRef.current?.focus() }}>
    <DialogHeader className="workspace-dialog-header"><DialogTitle>{title}</DialogTitle><DialogDescription>{action === 'create' ? '创建后将切换到新的工作区。' : action === 'import' ? '将备份恢复为新的工作区。' : '备份包含工作区内容和模型配置。'}</DialogDescription></DialogHeader>
    <form onSubmit={event => void submit(event)} className="workspace-dialog-form">
      {action !== 'export' && <div className="workspace-dialog-field"><Label htmlFor="workspace-backup-name">工作区名称</Label><Input id="workspace-backup-name" value={name} maxLength={100} onChange={event => { setName(event.target.value); setError('') }} placeholder="输入名称" disabled={busy}/></div>}
      {action !== 'create' && <div className="workspace-dialog-field"><div className="workspace-dialog-label"><Label htmlFor="workspace-backup-password">备份密码</Label><span>选填</span></div><Input id="workspace-backup-password" type="password" autoComplete={action === 'import' ? 'current-password' : 'new-password'} maxLength={1024} value={password} onChange={event => { setPassword(event.target.value); setError('') }} placeholder="留空或输入至少 8 个字符" disabled={busy} aria-describedby="workspace-backup-hint"/><p id="workspace-backup-hint" className="workspace-dialog-hint">{action === 'import' ? '无密码备份可直接导入；加密备份请输入密码。' : password ? '备份将加密并包含 API 密钥，请妥善保管密码。' : '无密码备份不加密，也不包含 API 密钥。'}</p></div>}
      {busy && action === 'export' && <div className="workspace-export-progress">
        <div className="workspace-export-progress-heading"><span role="status">{!exportProgress ? '等待选择保存位置…' : exportProgress.phase === 'preparing' ? '正在准备备份…' : exportProgress.phase === 'finishing' ? '正在完成备份…' : '正在导出工作区…'}</span></div>
        <div className="workspace-export-progress-track" role="progressbar" aria-label="工作区导出进度"><span/></div>
        <p>{exportProgress ? `已处理 ${exportProgress.files.toLocaleString('zh-CN')} 个文件 · ${formatBytes(exportProgress.bytes)}` : '请选择备份文件的保存位置。'}</p>
      </div>}
      {error && <p className="workspace-dialog-error" role="alert">{error}</p>}
      <DialogFooter className="workspace-dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" disabled={busy}>{busy ? '处理中…' : action === 'create' ? '选择位置并新建' : action === 'import' ? '选择备份并导入' : '导出'}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']; let value = bytes / 1024, index = 0
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++ }
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value)} ${units[index]}`
}
