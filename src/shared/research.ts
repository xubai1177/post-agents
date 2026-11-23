export interface ResearchSource { title: string; url: string; retrievedAt: string; fetched: boolean; origin?: 'model_search' | 'model_search_unlinked' }
export interface GenerationTrace { platformPrompt: string; titlePrompt: string; instruction: string; commonFacts: string; outline: string; initialTitle: string; initialContent: string; reviewFeedback: string; finalContent: string }
export interface ResearchRecord { trace?: GenerationTrace; version: 1; status: 'sources_found' | 'skipped'; checkedAt: string; sources: ResearchSource[]; pending: string[]; warnings: string[]; searchPlan?: string; articleVersion?: string; legacy?: boolean; stale?: boolean }
export type GenerationProgress = 'research' | 'plan' | 'write' | 'review' | 'save'
