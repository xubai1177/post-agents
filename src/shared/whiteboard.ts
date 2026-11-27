import type { Result } from './settings'
export type DrawingKind = 'text' | 'arrow' | 'box' | 'circle'
export type SceneLayout = 'list' | 'columns' | 'steps' | 'diagram' | 'concentric' | 'spotlight'
export type DrawingColor = 'ink' | 'green' | 'blue' | 'red' | 'orange'
export type DrawingEmphasis = 'highlight' | 'circle' | 'underline'
export interface StoryboardElement { type: DrawingKind; text: string; emphasis?: DrawingEmphasis; color?: DrawingColor; cue?: number; x?: number; y?: number; width?: number; height?: number }
export interface StickerPosition { x: number; y: number; width: number; height: number }
export interface StoryboardBeat { narration: string; elements: StoryboardElement[]; sticker: string; stickerCue?: number; stickerPosition?: StickerPosition }
export interface ElementRef { beat: number; element: number }
export interface StoryboardRelation { from: ElementRef; to: ElementRef; label?: string; color?: DrawingColor; style?: 'solid' | 'dashed' }
export interface StoryboardScene { focus: string; layout: SceneLayout; beats: StoryboardBeat[]; relations?: StoryboardRelation[] }
export interface Storyboard { title: string; scenes: StoryboardScene[] }
export interface VideoUsage { model: string; stage: '分镜'; status: '进行中' | '成功' | '失败' | '中断'; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null }
export interface StickerUsage { model: string; scene: number; beat?: number; status: '进行中' | '成功' | '失败' | '中断'; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; images: number | null; extraUnits?: Record<string, number> }
export interface Sticker { scene: number; beat?: number; description: string; filename: string }
export type RenderPhase = 'voice' | 'render' | 'export'
export interface RenderProgress { phase: RenderPhase; completed?: number; total?: number }
export type CloudVoiceProvider = 'volcengine' | 'agent-plan'
export interface VoiceConfig { id: string; name: string; provider: CloudVoiceProvider; url: string; hasKey: boolean }
export interface VoiceConfigInput { id?: string; name: string; provider: CloudVoiceProvider; url: string; key: string }
export type VoiceOptions = { mode: 'local'; speed: number } | { mode?: 'cloud'; configId: string; speaker: string; speed: number }
export interface ScenePreview { image: string; warnings: string[] }
export interface VideoRecord { id: string; title: string; createdAt: string | null }
export interface VideoProject { layoutWarnings?: string[]; id: string; topic: string; plan: Storyboard | null; usage: VideoUsage[]; imageUsage: StickerUsage[]; stickers: Sticker[]; lastVideo?: string; videos?: VideoRecord[]; renderStatus?: '进行中' | '完成' | '失败' | '中断'; error: string | null; updatedAt: string }
export interface CanvasAsset { name: string; original: string; image: string; width: number; height: number; backgroundRemoved: boolean }
export type LocalBackgroundGroup = '可爱手帐' | '木质纹理'
export interface LocalBackgroundItem { group: LocalBackgroundGroup; filename: string; name: string; thumbnail: string }
export interface CanvasImageUsage { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; images: number | null }
export interface CanvasAssetGeneration { asset: CanvasAsset; model: string; usage: CanvasImageUsage }
export interface CanvasWindowApi {
  listLocalBackgrounds: () => Promise<Result<LocalBackgroundItem[]>>
  readLocalBackground: (group: LocalBackgroundGroup, filename: string) => Promise<Result<CanvasAsset>>
  close: () => Promise<Result<void>>
  appearance: () => Promise<Result<{ appearance: import('./settings').AppearanceMode; accentColor: string; panelOpacity: number }>>
  importImage: () => Promise<Result<CanvasAsset | null>>
  generateImage: (description: string, purpose?: 'sticker' | 'background', ratio?: 'landscape' | 'vertical') => Promise<Result<CanvasAssetGeneration>>
  saveVideo: (bytes: Uint8Array) => Promise<Result<string | null>>
}
export interface WhiteboardApi {
  videoOpen: () => Promise<Result<void>>
  listVoiceConfigs: () => Promise<Result<VoiceConfig[]>>
  saveVoiceConfig: (input: VoiceConfigInput) => Promise<Result<VoiceConfig[]>>
  deleteVoiceConfig: (id: string) => Promise<Result<VoiceConfig[]>>
  previewVoice: (configId: string, speaker: string, text: string, speed: number) => Promise<Result<string>>
  canvasOpen: () => Promise<Result<void>>
  list: () => Promise<Result<VideoProject[]>>
  create: (topic: string) => Promise<Result<VideoProject>>
  plan: (id: string) => Promise<Result<VideoProject>>
  savePlan: (id: string, plan: Storyboard) => Promise<Result<VideoProject>>
  generateMissingStickers: (id: string) => Promise<Result<VideoProject>>
  generateSticker: (id: string, scene: number, beat: number) => Promise<Result<VideoProject>>
  sticker: (id: string, scene: number, beat: number) => Promise<Result<string | null>>
  replaceSticker: (id: string, scene: number, beat: number) => Promise<Result<VideoProject | null>>
  previewScene: (id: string, scene: number, plan?: Storyboard) => Promise<Result<ScenePreview>>
  render: (id: string, options: VoiceOptions) => Promise<Result<VideoProject>>
  cancel: (id: string) => Promise<Result<void>>
  preview: (id: string, videoId?: string) => Promise<Result<void>>
  deleteVideo: (id: string, videoId: string) => Promise<Result<VideoProject>>
  revealVideo: (id: string, videoId: string) => Promise<Result<void>>
  onRenderPhase: (callback: (progress: RenderProgress) => void) => () => void
  reveal: (id: string) => Promise<Result<void>>
}
export interface VideoWindowApi {
  appearance: () => Promise<Result<{ appearance: import('./settings').AppearanceMode; accentColor: string; panelOpacity: number; workspaceName: string }>>
  setState: (busy: boolean, dirty: boolean) => void
}
