import type { TopicRequest } from '../../../shared/topics'

export type TopicTask = { runId: string; request: TopicRequest; state: 'running' | 'waiting' }

// A waiting task is idle and can be replaced; a running task must finish first.
export function startTopicTask(tasks: Map<number, TopicTask>, senderId: number, task: TopicTask): boolean {
  if (tasks.get(senderId)?.state === 'running') return false
  tasks.set(senderId, task)
  return true
}
