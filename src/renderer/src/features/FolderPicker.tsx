import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import type { WorkspaceFolder, WorkspaceIndex } from '../../../shared/workspace'

export function folderPath(folder: WorkspaceFolder, folders: WorkspaceFolder[]): string {
  const names = [folder.name]; let parent = folder.parentId
  while (parent) { const item = folders.find(f => f.id === parent); if (!item) break; names.unshift(item.name); parent = item.parentId }
  return names.join(' / ')
}
export function FolderPicker({ index, value, onChange, onIndexChange, disabled = false }: { index: WorkspaceIndex; value: string | null; onChange: (id: string) => void; onIndexChange: (index: WorkspaceIndex) => void; disabled?: boolean }) {
  const [adding, setAdding] = useState(false), [name, setName] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false)
  async function add() {
    if (!name.trim() || saving) { if (!name.trim()) setError('请输入文件夹名称。'); return }
    setSaving(true); setError('')
    try {
      const result = await window.workspaceApi.change({ type: 'create', name: name.trim(), parentId: null })
      if (!result.ok) { setError(result.error); return }
      const folder = result.value.folders.find(item => item.parentId === null && item.name === name.trim())
      if (!folder) { setError('无法找到新建的文件夹，请重试。'); return }
      onIndexChange(result.value); onChange(folder.id); setAdding(false); setName('')
    } catch { setError('无法创建文件夹，请重试。') } finally { setSaving(false) }
  }
  return <div className="folder-picker"><Label htmlFor="article-destination">保存到</Label><div className="folder-picker-row"><NativeSelect id="article-destination" value={value ?? ''} disabled={disabled || saving || !index.folders.length} onChange={event => onChange(event.target.value)}><option value="" disabled>选择文件夹</option>{index.folders.map(folder => <option key={folder.id} value={folder.id}>{folderPath(folder, index.folders)}</option>)}</NativeSelect><Button variant="outline" type="button" disabled={disabled || saving} onClick={() => { setAdding(!adding); setError('') }}>新建文件夹</Button></div>{adding && <div className="folder-picker-row"><Input aria-label="新文件夹名称" autoFocus maxLength={100} value={name} disabled={disabled || saving} onChange={event => { setName(event.target.value); setError('') }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void add() } }}/><Button variant="outline" type="button" disabled={disabled || saving} onClick={() => void add()}>创建</Button><Button variant="ghost" type="button" disabled={disabled || saving} onClick={() => { setAdding(false); setError('') }}>取消</Button></div>}{error && <p role="alert" className="error">{error}</p>}</div>
}
