import { z } from 'zod'

const id = z.string().uuid()
const image = z.string().max(30_000_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
const background = z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/), image: image.nullable(), name: z.string().max(100), mode: z.enum(['cover', 'tile']), scale: z.number().min(.1).max(3), x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
const item = z.object({ id, kind: z.enum(['text', 'line', 'arrow', 'rect', 'circle', 'image', 'vector']), x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(.03).max(1), h: z.number().min(.03).max(1), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), lineWidth: z.number().min(1).max(12), size: z.number().min(12).max(100), text: z.string().max(120), image: image.optional(), builtinId: z.string().max(100).optional(), duration: z.number().min(.5).max(12), drawOrder: z.number().int().min(0).max(1000000).optional(), wait: z.number().min(0).max(60).optional(), decoration: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).refine(v => v.x + v.w <= 1.000001 && v.y + v.h <= 1.000001)
const asset = z.object({ name: z.string().max(100), original: image, image, width: z.number().int().positive().max(4096), height: z.number().int().positive().max(4096), backgroundRemoved: z.boolean() })
export const canvasVoiceSettingsSchema = z.object({ mode: z.enum(['local', 'cloud']), configId: z.string().max(100), speaker: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), speed: z.number().finite().min(.6).max(1.6) })
export const canvasProjectDataSchema = z.object({ version: z.literal(1), voice: canvasVoiceSettingsSchema.default({ mode: 'local', configId: '', speaker: 'zh_female_vv_uranus_bigtts', speed: 1 }), name: z.string().trim().min(1).max(80), panels: z.array(z.object({ id, name: z.string().min(1).max(80), items: z.array(item).max(1000), background, narration: z.string().max(10000).default(''), holdSeconds: z.number().finite().min(0).max(60).default(2), ratio: z.enum(['landscape', 'vertical']) })).min(1).max(100), assets: z.array(asset).max(500), activePanel: z.number().int().min(0), pen: z.enum(['pencil', 'marker', 'fountain', 'none']) }).refine(v => v.activePanel < v.panels.length && new Set(v.panels.map(p => p.id)).size === v.panels.length)
export type CanvasProjectData = z.infer<typeof canvasProjectDataSchema>
export interface CanvasProject extends CanvasProjectData { id: string; revision: string; updatedAt: string }
export interface CanvasProjectSummary { id: string; name: string; updatedAt: string }

export type CanvasVoiceStatus = { panelId: string; state: 'empty' | 'missing' | 'ready' | 'stale' | 'unavailable' }

export const canvasVoiceSnapshotSchema = z.object({ voice: canvasVoiceSettingsSchema, panels: z.array(z.object({ id, narration: z.string().max(10000) })).min(1).max(100) })
export type CanvasVoiceSnapshot = z.infer<typeof canvasVoiceSnapshotSchema>
