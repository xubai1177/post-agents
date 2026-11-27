// Only use size parameters for integrations whose model contract is known.
export function coverSizeForStyle(config: { apiUrl: string; model: string }, prompt: string): string | undefined {
  let url: URL
  try { url = new URL(config.apiUrl) } catch { return undefined }
  const official = url.protocol === 'https:' && url.hostname === 'api.openai.com' && config.model === 'gpt-image-2'
  const localCodex = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && config.model === 'codex/gpt-image-2'
  if (!official && !localCodex) return undefined
  const matches = [...prompt.matchAll(/封面画幅比例\s*[：:]\s*(\d{1,3}(?:\.\d{1,2})?)\s*[:：]\s*(\d{1,3}(?:\.\d{1,2})?)(?![\d.])/g)]
  if (matches.length !== 1) return undefined
  const first = Number(matches[0][1]), second = Number(matches[0][2])
  if (!first || !second || first / second < 1 / 3 || first / second > 3) return undefined
  const a = Math.round(first * 100), b = Math.round(second * 100)
  const gcd = (x: number, y: number): number => y === 0 ? x : gcd(y, x % y)
  const divisor = gcd(a, b), widthUnit = a / divisor, heightUnit = b / divisor
  const scale = Math.ceil(Math.sqrt(800_000 / (widthUnit * heightUnit)) / 16) * 16
  const width = widthUnit * scale, height = heightUnit * scale
  if (width > 3840 || height > 3840 || width * height < 655360 || width * height > 8294400) return undefined
  return `${width}x${height}`
}
