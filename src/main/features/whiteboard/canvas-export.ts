import { randomUUID } from 'node:crypto'
import { link, open, unlink } from 'node:fs/promises'

/** A temporary file and exclusive hard link keep existing exports untouched. */
export async function saveCanvasVideo(path: string, data: Uint8Array): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`
  let created = false
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(temp, 'wx', 0o600); created = true
    await handle.writeFile(data); await handle.close(); handle = undefined
    await link(temp, path)
  } finally {
    if (handle) await handle.close().catch(error => console.warn('白板视频：无法关闭临时文件', error))
    if (created) await unlink(temp).catch(error => console.warn('白板视频：无法清理临时文件', error))
  }
}
