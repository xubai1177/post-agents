import { ipcMain, shell } from 'electron'
import { platforms } from '../../shared/drafts'
import type { TopicEvent, TopicRequest, TopicRunResult } from '../../shared/topics'
import { getRuntimeSettings } from '../features/settings/settings'
import { researchTopic } from '../features/research/research'
import { generateTopics } from '../features/topics/topic-service'
import { createTextModel } from '../infrastructure/text-model'
import { respond } from './security'

type Task = { runId: string; request: TopicRequest; state: 'running' | 'waiting' }
const tasks = new Map<number, Task>()
const allowedSources = new Map<number, Set<string>>()
function validRequest(value: unknown): value is TopicRequest {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return typeof r.direction === 'string' && !!r.direction.trim() && r.direction.length <= 100 && typeof r.audience === 'string' && r.audience.length <= 500 && Array.isArray(r.platforms) && r.platforms.length > 0 && r.platforms.length <= platforms.length && r.platforms.every((p: unknown) => typeof p === 'string' && platforms.some((name) => name === p)) && new Set(r.platforms).size === r.platforms.length
}
async function execute(event: Electron.IpcMainInvokeEvent, task: Task, skip: boolean): Promise<TopicRunResult> {
  try {
    const config = await getRuntimeSettings()
    if (!config.apiUrl || !config.model || !config.apiKey) throw new Error('model unavailable')
    const onProgress = (update: TopicEvent) => {
      if (event.sender.isDestroyed()) return
      const allowed = allowedSources.get(event.sender.id)
      for (const source of update.sources ?? []) allowed?.add(source.url)
      event.sender.send('topics:progress', update)
    }
    const result = await generateTopics(task.request, skip, task.runId, onProgress, { research: researchTopic, call: createTextModel(config) })
    if (tasks.get(event.sender.id) === task) {
      if (result.status === 'research_failed') task.state = 'waiting'
      else tasks.delete(event.sender.id)
    }
    return result
  } catch {
    if (tasks.get(event.sender.id) === task) tasks.delete(event.sender.id)
    throw new Error('选题生成失败，请检查模型配置或稍后重试。')
  }
}
export function registerTopics(): void {
  ipcMain.handle('topics:start', (event, runId: unknown, request: unknown) => respond(event, async () => {
    if (typeof runId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(runId) || !validRequest(request)) throw new Error('invalid request')
    const senderId = event.sender.id
    if (tasks.has(senderId)) throw new Error('task running')
    if (!allowedSources.has(senderId)) {
      allowedSources.set(senderId, new Set())
      event.sender.once('destroyed', () => { allowedSources.delete(senderId); tasks.delete(senderId) })
    }
    const task: Task = { runId, request: { direction: request.direction.trim(), audience: request.audience.trim(), platforms: [...request.platforms] }, state: 'running' }
    tasks.set(senderId, task)
    return execute(event, task, false)
  }))
  ipcMain.handle('topics:resume', (event, runId: unknown, mode: unknown) => respond(event, async () => {
    const task = tasks.get(event.sender.id)
    if (!task || task.runId !== runId || task.state !== 'waiting' || (mode !== 'retry' && mode !== 'skip')) throw new Error('invalid task')
    task.state = 'running'
    return execute(event, task, mode === 'skip')
  }))
  ipcMain.handle('topics:open-source', (event, url: unknown) => respond(event, async () => {
    if (typeof url !== 'string' || url.length > 4096 || !allowedSources.get(event.sender.id)?.has(url)) throw new Error('invalid source')
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) throw new Error('invalid url')
    await shell.openExternal(parsed.href)
  }))
}
