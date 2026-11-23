import { Notification } from 'electron'
import { generationNoticeText, type GenerationNotice } from '../features/generation-notifications'

export function notifyGeneration(notice: GenerationNotice): void {
  const content = generationNoticeText(notice)
  if (!content) return
  try {
    if (!Notification.isSupported()) { console.warn('系统通知不可用。'); return }
    const notification = new Notification(content)
    notification.on('failed', () => console.warn('系统通知发送失败，请检查系统通知设置。'))
    notification.show()
  } catch { console.warn('系统通知发送失败，请检查系统通知设置。') }
}
