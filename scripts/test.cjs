const { buildSync } = require('esbuild')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')
const dir = mkdtempSync(join(tmpdir(), 'post-agents-tests-'))
try {
  const output = join(dir, 'drafts.test.cjs')
  buildSync({ entryPoints: ['tests/drafts.test.ts'], bundle: true, tsconfig: 'tsconfig.web.json', platform: 'node', format: 'cjs', jsx: 'automatic', outfile: output, logLevel: 'silent' })
  const result = spawnSync(process.execPath, ['--test', output], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally { rmSync(dir, { recursive: true, force: true }) }
