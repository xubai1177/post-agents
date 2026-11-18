import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { ModelCall } from '../features/content/content-pipeline'

export function createTextModel(config: { model: string; apiKey: string; apiUrl: string }): ModelCall {
  const model = new ChatOpenAI({ model: config.model, apiKey: config.apiKey, configuration: { baseURL: config.apiUrl }, maxRetries: 0, timeout: 120000, streamUsage: false })
  return async (system, user) => (await model.invoke([new SystemMessage(system), new HumanMessage(user)])).text
}
