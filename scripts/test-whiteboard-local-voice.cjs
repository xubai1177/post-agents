// This integration test uses the macOS speech service.
const { buildSync } = require('esbuild')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const dir = mkdtempSync(join(tmpdir(), 'whiteboard-local-voice-test-'))
try {
  const bundle = join(dir, 'test.cjs')
  buildSync({ entryPoints: ['tests/whiteboard-local-voice.test.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: bundle })
  const result = spawnSync(process.execPath, ['--test', bundle], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally { rmSync(dir, { recursive: true, force: true }) }
