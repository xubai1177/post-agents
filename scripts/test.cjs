const { buildSync } = require('esbuild')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')
const dir = mkdtempSync(join(tmpdir(), 'post-agents-tests-'))
try {
  const output = join(dir, 'drafts.test.cjs')
  buildSync({ entryPoints: ['tests/drafts.test.ts', 'tests/whiteboard.test.ts', 'tests/whiteboard-builtins.test.ts', 'tests/whiteboard-volcengine.test.ts', 'tests/whiteboard-voice-preview.test.ts'], bundle: true, tsconfig: 'tsconfig.web.json', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['electron'], outdir: dir, logLevel: 'silent' })
  const result = spawnSync(process.execPath, ['--test', output.replace('.cjs', '.js'), join(dir, 'whiteboard.test.js'), join(dir, 'whiteboard-builtins.test.js'), join(dir, 'whiteboard-volcengine.test.js'), join(dir, 'whiteboard-voice-preview.test.js')], { stdio: 'inherit', env: { ...process.env, NODE_PATH: [join(process.cwd(), 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(require('node:path').delimiter) } })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally { rmSync(dir, { recursive: true, force: true }) }
