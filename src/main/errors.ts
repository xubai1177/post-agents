export class ResearchUnavailableError extends Error {
  constructor() { super('联网核查不可用或没有找到来源，请重试或选择继续生成未核查草稿。') }
}
