const { buildSync } = require('esbuild')
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const { spawnSync } = require('node:child_process')
const dir = mkdtempSync(join(tmpdir(), 'whiteboard-window-test-'))
try {
  const bundle = join(dir, 'video-window.cjs'), page = join(dir, 'index.html')
  writeFileSync(page, '<!doctype html><title>白板测试</title>')
  buildSync({ entryPoints: ['src/main/features/whiteboard/video-window.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: bundle, logLevel: 'silent' })
  const result = spawnSync(require('electron'), ['tests/whiteboard-window.electron.cjs', bundle], { stdio: 'inherit', env: { ...process.env, ELECTRON_RENDERER_URL: pathToFileURL(page).href } })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally { rmSync(dir, { recursive: true, force: true }) }
