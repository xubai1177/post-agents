export interface ResearchSource { title: string; url: string; retrievedAt: string; fetched: boolean }
export interface ResearchRecord { version: 1; status: 'sources_found' | 'skipped'; checkedAt: string; sources: ResearchSource[]; pending: string[]; warnings: string[] }
export type GenerationProgress = 'research' | 'plan' | 'write' | 'review' | 'save'
