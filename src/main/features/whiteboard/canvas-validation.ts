import type { CanvasImageUsage } from '../../../shared/whiteboard'
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
export function canvasImageUsage(value: unknown): CanvasImageUsage {
  const usage = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return { inputTokens: count(usage.input_tokens), outputTokens: count(usage.output_tokens), totalTokens: count(usage.total_tokens), images: count(usage.images) }
}
export function isSafeCanvasImage(bytes: Uint8Array): boolean {
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) return false
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp = bytes.length >= 12 && [82, 73, 70, 70].every((byte, i) => bytes[i] === byte) && [87, 69, 66, 80].every((byte, i) => bytes[i + 8] === byte)
  return png || jpeg || webp
}
export function isSafeCanvasVideo(bytes: unknown): bytes is Uint8Array {
  return bytes instanceof Uint8Array && bytes.byteLength >= 4 && bytes.byteLength <= 200 * 1024 * 1024 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
}
