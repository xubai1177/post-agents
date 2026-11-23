export function isTrustedRendererUrl(actual: string, expected: string, dev: boolean): boolean {
  try {
    const url = new URL(actual), reference = new URL(expected)
    if (dev) return url.origin === reference.origin
    url.hash = ''; reference.hash = ''
    return url.href === reference.href
  } catch { return false }
}
