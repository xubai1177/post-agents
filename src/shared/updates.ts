import type { Result } from './settings'
export type UpdateState = {
  currentVersion: string
  platform: 'windows' | 'mac' | 'unsupported'
  status: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  notes?: string
  progress?: number
  error?: string
  errorStage?: 'check' | 'download'
}
export interface UpdatesApi {
  state(): Promise<Result<UpdateState>>
  check(): Promise<Result<UpdateState>>
  download(): Promise<Result<void>>
  install(): Promise<Result<void>>
  openRelease(): Promise<Result<void>>
  onChanged(callback: (state: UpdateState) => void): () => void
}
