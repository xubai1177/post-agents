import { ModelSearchError } from './infrastructure/model-search'
export class ResearchUnavailableError extends Error {
  constructor(cause?: unknown) { super(cause instanceof ModelSearchError ? `${cause.message} 可重试或选择跳过联网。` : '联网核查不可用或没有找到来源，请重试或选择继续生成未核查草稿。') }
}
