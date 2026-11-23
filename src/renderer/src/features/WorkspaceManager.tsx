import { useConfirmDialog } from '../components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import type { AppSettings, Result } from '../../../shared/settings'

type Props = { onChanged: () => void; disabled: boolean }
export function WorkspaceManager({ onChanged, disabled }: Props) {
  const { confirm, confirmation } = useConfirmDialog()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function change(run: () => Promise<Result<AppSettings | null>>) {
    if (!(await confirm({
      title: '切换工作空间？',
      message: '当前文章将关闭，设置页面中未保存的修改会丢弃。',
      action: '继续切换',
    }))) return
    setBusy(true); setMessage('')
    try { const result = await run(); if (!result.ok) setMessage(result.error); else if (result.value) { setPassword(''); onChanged() } } catch { setMessage('工作空间操作失败。') } finally { setBusy(false) }
  }
  async function backup() {
    if (password.length < 8) { setMessage('备份密码至少需要 8 个字符。'); return }
    setBusy(true); setMessage('')
    try { const result = await window.workspaceApi.exportBackup(password); if (!result.ok) setMessage(result.error); else if (result.value) { setPassword(''); setMessage('加密备份已保存。请妥善保管密码，丢失后无法恢复。') } } catch { setMessage('导出失败。') } finally { setBusy(false) }
  }
  return <Card asChild><section className="form-card workspace-settings" aria-label="工作空间管理"><div className="form-heading"><div><h2>工作空间管理</h2><p>新建、切换或备份本地工作空间</p></div></div><fieldset disabled={disabled || busy} className="settings-fields"><Label className="field"><span>新工作空间名称</span><Input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="输入新建或导入后的名称" /></Label><div className="workspace-manager-actions"><Button variant="ghost" type="button" onClick={() => void change(() => window.workspaceApi.create(name.trim()))} disabled={!name.trim()}>新建工作空间</Button><Button variant="ghost" type="button" onClick={() => void change(() => window.workspaceApi.open())}>打开工作空间</Button></div><Label className="field"><span>备份密码</span><Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 个字符" /><small>备份包含模型配置与密钥。密码不会保存，丢失后无法恢复。</small></Label><div className="workspace-manager-actions"><Button variant="ghost" type="button" onClick={() => void backup()}>导出加密备份</Button><Button variant="ghost" type="button" disabled={!name.trim() || password.length < 8} onClick={() => void change(() => window.workspaceApi.importBackup(password, name.trim()))}>导入加密备份</Button></div></fieldset>{message && <p role="status">{message}</p>}{confirmation}</section></Card>
}
