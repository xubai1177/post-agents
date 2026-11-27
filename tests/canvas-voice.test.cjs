const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, rm } = require('node:fs/promises')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { randomUUID } = require('node:crypto')
const { buildSync } = require('esbuild')
const bundleDir = mkdtempSync(join(tmpdir(), 'canvas-voice-bundle-'))
const bundle = join(bundleDir, 'voice.cjs')
const electronStub = join(bundleDir, 'electron.cjs'); writeFileSync(electronStub, 'module.exports = {}')
buildSync({ stdin: { contents: `export * from './src/main/features/whiteboard/canvas-voice'; export * from './src/main/features/whiteboard/canvas-project'`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', alias: { electron: electronStub }, outfile: bundle, logLevel: 'silent' })
const api = require(bundle)
after(() => rm(bundleDir, { recursive: true, force: true }))
function wav() { const data = Buffer.alloc(4800), h = Buffer.alloc(44); h.write('RIFF'); h.writeUInt32LE(data.length + 36, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40); return Buffer.concat([h, data]) }
const input = () => ({ version: 1, name: '测试', voice: { mode: 'local', configId: '', speaker: 'zh_female_vv_uranus_bigtts', speed: 1 }, panels: ['第一段旁白。', '第二段旁白。', ''].map((narration, i) => ({ id: randomUUID(), name: `画布 ${i + 1}`, narration, holdSeconds: 2, items: [], background: { color: '#ffffff', image: null, name: '', mode: 'cover', scale: 1, x: .5, y: .5 }, ratio: 'landscape' })), assets: [], activePanel: 0, pen: 'pencil' })
test('独立生成、变更后过期与失败保留成功配音', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas-voice-test-'))
  try {
    let project = await api.saveCanvasProject(root, null, null, input())
    const [first, second] = project.panels
    assert.deepEqual((await api.canvasVoiceStatuses(root, project.id, project)).map(x => x.state), ['missing', 'missing', 'empty'])
    await api.generateCanvasVoice(root, project.id, project.revision, first.id, async () => wav())
    await api.generateCanvasVoice(root, project.id, project.revision, second.id, async () => wav())
    assert.deepEqual((await api.canvasVoiceStatuses(root, project.id, project)).map(x => x.state), ['ready', 'ready', 'empty'])
    const before = await api.previewCanvasVoice(root, project.id, project, first.id)
    await assert.rejects(api.generateCanvasVoice(root, project.id, project.revision, first.id, async () => { throw new Error('模拟失败') }))
    assert.equal(await api.previewCanvasVoice(root, project.id, project, first.id), before)
    project = await api.saveCanvasProject(root, project.id, project.revision, { ...project, panels: project.panels.map((p, i) => i === 0 ? { ...p, narration: '修改后的旁白。' } : p) })
    assert.deepEqual((await api.canvasVoiceStatuses(root, project.id, project)).map(x => x.state), ['stale', 'ready', 'empty'])
    await assert.rejects(api.previewCanvasVoice(root, project.id, project, first.id), /需要更新/)
    await api.generateCanvasVoice(root, project.id, project.revision, first.id, async () => wav())
    assert.deepEqual((await api.canvasVoiceStatuses(root, project.id, { ...project, voice: { ...project.voice, speed: 1.2 } })).map(x => x.state), ['stale', 'stale', 'empty'])
    await assert.rejects(api.generateCanvasVoice(root, project.id, '0'.repeat(64), first.id, async () => wav()), /外部修改/)
    const oldRevision = project.revision
    await assert.rejects(api.generateCanvasVoice(root, project.id, oldRevision, first.id, async () => {
      project = await api.saveCanvasProject(root, project.id, project.revision, { ...project, name: '生成时修改' })
      return wav()
    }), /生成期间工程已修改/)
    assert.equal((await api.canvasVoiceStatuses(root, project.id, project))[0].state, 'ready')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('真实 macOS 系统语音可为画布生成并读取配音', { skip: process.env.CANVAS_REAL_VOICE !== '1' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas-real-voice-test-'))
  try {
    const project = await api.saveCanvasProject(root, null, null, input()), first = project.panels[0]
    await api.generateCanvasVoice(root, project.id, project.revision, first.id)
    assert.equal((await api.canvasVoiceStatuses(root, project.id, project))[0].state, 'ready')
    assert.match(await api.previewCanvasVoice(root, project.id, project, first.id), /^data:audio\/wav;base64,/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
