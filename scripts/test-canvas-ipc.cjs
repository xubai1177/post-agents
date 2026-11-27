const { buildSync } = require('esbuild')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const dir = mkdtempSync(join(tmpdir(), 'canvas-ipc-test-'))
try {
  const main = join(dir, 'main'), preload = join(dir, 'preload'), root = join(dir, 'workspace'), page = join(dir, 'page.html')
  mkdirSync(main); mkdirSync(preload); mkdirSync(root)
  writeFileSync(page, '<!doctype html><title>画布接口测试</title>')
  buildSync({ entryPoints: ['src/preload/canvas.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: join(preload, 'canvas.js'), logLevel: 'silent' })
  buildSync({ stdin: { contents: "export { registerWhiteboard } from './src/main/ipc/whiteboard-ipc'; export { openCanvasWindow, isCanvasWindow } from './src/main/features/whiteboard/canvas-window'", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: join(main, 'test.cjs'), logLevel: 'silent' })
  const result = spawnSync(require('electron'), ['tests/canvas-ipc.electron.cjs', join(main, 'test.cjs'), root], { stdio: 'inherit', env: { ...process.env, ELECTRON_RENDERER_URL: pathToFileURL(page).href } })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally { rmSync(dir, { recursive: true, force: true }) }
