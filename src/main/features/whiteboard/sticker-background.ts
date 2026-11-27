/** Removes only opaque near-white pixels connected to a mostly white outer border. BGRA bitmap. */
export function removeWhiteBorder(bitmap: Buffer, width: number, height: number): Buffer | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width * height > 16000000 || bitmap.length !== width * height * 4) return null
  const white = (index: number) => { const p = index * 4; return bitmap[p] >= 248 && bitmap[p + 1] >= 248 && bitmap[p + 2] >= 248 && bitmap[p + 3] === 255 }
  const border: number[] = []
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x)
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1)
  if (border.filter(white).length / border.length < 0.95) return null
  const result = Buffer.from(bitmap), visited = new Uint8Array(width * height), queue = new Uint32Array(width * height)
  let head = 0, tail = 0
  const add = (index: number) => { if (!visited[index] && white(index)) { visited[index] = 1; queue[tail++] = index } }
  border.forEach(add)
  while (head < tail) {
    const current = queue[head++], x = current % width, y = Math.floor(current / width)
    if (x > 0) add(current - 1); if (x + 1 < width) add(current + 1)
    if (y > 0) add(current - width); if (y + 1 < height) add(current + width)
  }
  // Keep images that are almost empty or do not have a meaningful white margin unchanged.
  if (tail < width * height * 0.02 || tail > width * height * 0.98) return null
  for (let i = 0; i < tail; i++) { const p = queue[i] * 4; result[p] = 0; result[p + 1] = 0; result[p + 2] = 0; result[p + 3] = 0 }
  return result
}
