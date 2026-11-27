// This integration test requires a graphical session for scene previews.
const { buildSync } = require('esbuild')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const dir = mkdtempSync(join(tmpdir(), 'whiteboard-project-test-'))
try {
  const bundle = join(dir, 'project.cjs')
  buildSync({ entryPoints: ['src/main/features/whiteboard/project.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: bundle })
  const result = spawnSync(require('electron'), ['tests/whiteboard-project.electron.cjs', bundle], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally { rmSync(dir, { recursive: true, force: true }) }
