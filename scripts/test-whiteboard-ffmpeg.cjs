// This integration test requires a macOS graphical session.
const { buildSync } = require('esbuild')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
if (process.platform !== 'darwin') { console.error('白板视频集成测试需要 macOS。'); process.exit(1) }
const dir = mkdtempSync(join(tmpdir(), 'whiteboard-ffmpeg-test-'))
try {
  const bundle = join(dir, 'test.cjs')
  buildSync({ entryPoints: ['tests/whiteboard-ffmpeg-entry.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: bundle })
  const result = spawnSync(require('electron'), ['tests/whiteboard-ffmpeg.electron.cjs', bundle], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status || (result.signal ? 1 : 0)
} finally { rmSync(dir, { recursive: true, force: true }) }
