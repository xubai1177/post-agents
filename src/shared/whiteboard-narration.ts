/** The existing speech segmentation is also the set of available visual anchors. */
export function splitNarration(value: string): string[] {
  const parts: string[] = []; let text = ''
  for (const char of value) { text += char; if ('。！？!?；;，,'.includes(char) || Array.from(text).length >= 24) { if (text.trim()) parts.push(text); text = '' } }
  if (text.trim()) parts.push(text)
  return parts
}
