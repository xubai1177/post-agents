import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPlatform, createTopic, listDrafts, readDraft, saveDraft } from '../src/main/features/drafts/draft-store'
import { generateDrafts } from '../src/main/features/content/generation'

async function withRoot(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'post-agents-test-'))
  try { await fn(root) } finally { await rm(root, { recursive: true, force: true }) }
}
test('本地草稿按主题和平台读取，保存后重新读取', () => withRoot(async (root) => {
  const id = await createTopic(root, '测试主题')
  await createPlatform(root, id, '小红书', '# 原文\n')
  assert.deepEqual(await listDrafts(root), [{ id, title: id, platforms: ['小红书'] }])
  const initial = await readDraft(root, id, '小红书')
  await saveDraft(root, id, '小红书', '# 修改\n', initial.version)
  assert.equal((await readDraft(root, id, '小红书')).content, '# 修改\n')
  await assert.rejects(createTopic(root, '测试主题'), /同名/)
}))
test('外部改动冲突不会覆盖，路径越界被拒绝', () => withRoot(async (root) => {
  const id = await createTopic(root, '主题')
  await createPlatform(root, id, '公众号', '原文')
  const original = await readDraft(root, id, '公众号')
  const file = join(root, id, '公众号', '发布文案.md')
  await writeFile(file, '外部更新')
  await assert.rejects(saveDraft(root, id, '公众号', '本地更新', original.version), /外部修改/)
  assert.equal(await readFile(file, 'utf8'), '外部更新')
  await assert.rejects(readDraft(root, '../other', '公众号'))
}))
test('多平台部分失败时保留成功的文案；全部失败可重新生成', () => withRoot(async (root) => {
  const request = { title: '生成主题', audience: '', platforms: ['小红书', '公众号'] as const }
  const result = await generateDrafts(root, { ...request, platforms: [...request.platforms] }, async (platform) => {
    if (platform === '公众号') throw new Error('service failed')
    return '# 小红书结果'
  })
  assert.deepEqual(result.draft?.platforms, ['小红书'])
  assert.equal(result.failures[0].platform, '公众号')
  assert.equal((await readDraft(root, '生成主题', '小红书')).content, '# 小红书结果\n')
  const failed = await generateDrafts(root, { title: '失败主题', audience: '', platforms: ['公众号'] }, async () => { throw new Error('failed') })
  assert.equal(failed.draft, null)
  await mkdir(join(root, '失败主题'))
}))
test('并发保存旧版本时只接受一次，避免互相覆盖', () => withRoot(async (root) => {
  const id = await createTopic(root, '并发')
  await createPlatform(root, id, '小红书', '初始')
  const version = (await readDraft(root, id, '小红书')).version
  const results = await Promise.allSettled([
    saveDraft(root, id, '小红书', '第一次', version),
    saveDraft(root, id, '小红书', '第二次', version)
  ])
  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].status, 'rejected')
  assert.equal((await readDraft(root, id, '小红书')).content, '第一次')
}))

test('配图按平台隔离、按编号保存且不覆盖已有文件', () => withRoot(async (root) => {
  const { saveImage, listImages } = await import('../src/main/features/images/image-store')
  const id = await createTopic(root, '图片主题')
  await createPlatform(root, id, '小红书', '# 标题')
  await createPlatform(root, id, '公众号', '# 标题')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
  const first = await saveImage(root, id, '小红书', 0, png)
  const second = await saveImage(root, id, '小红书', 1, png)
  assert.equal(first.name, '01-封面.png'); assert.equal(second.name, '02-配图1.png')
  assert.deepEqual((await listImages(root, id, '小红书')).map((item) => item.name), [first.name, second.name])
  assert.deepEqual(await listImages(root, id, '公众号'), [])
  await assert.rejects(saveImage(root, id, '公众号', 0, Buffer.from('not an image')))
  const third = await saveImage(root, id, '小红书', 0, png)
  assert.equal(third.name, '03-封面.png')
  assert.deepEqual(await readFile(join(root, id, '小红书', '图片', first.name)), png)
}))
test('图片生成部分失败保留成功文件，文案变化后停止后续生成', () => withRoot(async (root) => {
  const { generateImages } = await import('../src/main/features/images/image-generation')
  const id = await createTopic(root, '配图')
  await createPlatform(root, id, '抖音图文', '# 初稿')
  const version = (await readDraft(root, id, '抖音图文')).version
  const request = { id, platform: '抖音图文' as const, version, count: 3 }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
  const partial = await generateImages(root, request, ['one', 'two', 'three'], async (prompt) => { if (prompt === 'two') throw new Error('service failure'); return png })
  assert.equal(partial.images.length, 2); assert.deepEqual(partial.failures.map((f) => f.index), [2])
  let calls = 0
  const changed = await generateImages(root, request, ['one', 'two', 'three'], async () => { calls++; await writeFile(join(root, id, '抖音图文', '发布文案.md'), '# 外部改动'); return png })
  assert.equal(calls, 1); assert.equal(changed.images.length, 0); assert.equal(changed.failures.length, 3)
}))
test('图片接口支持返回 base64，并拒绝无效的响应', async () => {
  const { requestImage } = await import('../src/main/infrastructure/image-provider')
  const original = globalThis.fetch
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
  try {
    globalThis.fetch = async (url, options) => { assert.equal(String(url), 'http://127.0.0.1:1234/v1/images/generations'); assert.equal(options?.method, 'POST'); return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] })) }
    assert.deepEqual(await requestImage({ apiUrl: 'http://127.0.0.1:1234/v1', model: 'image', apiKey: 'fake' }, '封面'), png)
    globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ b64_json: '!bad!' }] }))
    await assert.rejects(requestImage({ apiUrl: 'http://127.0.0.1:1234/v1', model: 'image', apiKey: 'fake' }, '封面'))
    globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ url: 'https://127.0.0.1/image.png' }] }))
    await assert.rejects(requestImage({ apiUrl: 'http://127.0.0.1:1234/v1', model: 'image', apiKey: 'fake' }, '封面'), /图片地址无效/)
  } finally { globalThis.fetch = original }
})

test('检索来源解析去重、保存并可再次读取，来源不进入发布文案', () => withRoot(async (root) => {
  const { parseSearch, saveResearch, readResearch } = await import('../src/main/features/research/research')
  const id = await createTopic(root, '核查')
  await createPlatform(root, id, '小红书', '# 发布内容')
  const results = parseSearch('1. 人社指南 — https://example.gov.cn/guide\nCrawled: today; 官方内容\n\n2. 重复 — https://example.gov.cn/guide\n重复摘要', '2026-11-18T00:00:00.000Z')
  assert.equal(results.length, 1); assert.equal(results[0].url, 'https://example.gov.cn/guide')
  await saveResearch(root, id, { version: 1, status: 'sources_found', checkedAt: '2026-11-18T00:00:00.000Z', sources: results.map(({ title, url, retrievedAt, fetched }) => ({ title, url, retrievedAt, fetched })), pending: ['核对办理入口'], warnings: [] })
  const record = await readResearch(root, id)
  assert.equal(record?.sources[0].title, '人社指南'); assert.deepEqual(record?.pending, ['核对办理入口'])
  assert.equal((await readDraft(root, id, '小红书')).content, '# 发布内容')
  await assert.rejects(saveResearch(root, id, record!))
  await assert.rejects(readResearch(root, '../other'))
}))
test('联网策划使用来源并为每个平台制定不同写作计划', async () => {
  const { planContent, writeContent } = await import('../src/main/features/content/content-pipeline')
  const source = { title: '官方指南', url: 'https://example.gov.cn/guide', retrievedAt: '2026-11-18', fetched: true, text: '官方事实' }
  const calls: { system: string; user: string }[] = []
  const call = async (system: string, user: string) => { calls.push({ system, user }); return calls.length === 1 ? JSON.stringify({ commonFacts: '官方事实', pending: ['核查时间'], platforms: { 小红书: '场景入口', 公众号: '深度解释' } }) : '# 示例文案' }
  const plan = await planContent(call, '主题', '受众', ['小红书', '公众号'], [source])
  await writeContent(call, '主题', '受众', '公众号', plan, [source])
  assert.match(calls[0].user, /官方事实/); assert.match(calls[1].user, /深度解释/); assert.match(calls[1].system, /公众号/)
  assert.deepEqual(plan.pending, ['核查时间'])
})
test('平台差异检查无法完成时保留原文并提示；有建议时仅调整对应平台', async () => {
  const { reviewVersions } = await import('../src/main/features/content/content-pipeline')
  const original = { 小红书: '小红书原文', 公众号: '公众号原文' }
  const failed = await reviewVersions(async () => { throw new Error('offline') }, original)
  assert.deepEqual(failed.drafts, original); assert.ok(failed.warnings.length)
  let calls = 0
  const revised = await reviewVersions(async () => ++calls === 1 ? JSON.stringify({ 公众号: '补充依据' }) : '公众号修改版', original)
  assert.equal(revised.drafts.公众号, '公众号修改版'); assert.equal(revised.drafts.小红书, original.小红书)
})
test('全部平台失败时不留下空主题，且差异检查失败不丢失成功平台', () => withRoot(async (root) => {
  const result = await generateDrafts(root, { title: '差异检查', audience: '', platforms: ['小红书', '公众号'], research: 'skip' }, async (platform) => platform === '小红书' ? '内容' : Promise.reject(new Error('fail')), async () => { throw new Error('review failed') })
  assert.deepEqual(result.draft?.platforms, ['小红书']); assert.equal(result.failures[0].platform, '公众号'); assert.ok(result.warnings?.length)
  assert.equal((await readDraft(root, '差异检查', '小红书')).content, '内容\n')
}))

test('内容流程在检索失败时停止，返回可识别的错误', () => withRoot(async (root) => {
  const { generateContent } = await import('../src/main/features/content/content-service')
  const { ResearchUnavailableError } = await import('../src/main/errors')
  const config = { draftsDirectory: root, apiUrl: 'https://example.com', model: 'test', apiKey: 'test' }
  const phases: string[] = []
  await assert.rejects(generateContent({ title: '联网失败', audience: '', platforms: ['小红书'], research: 'online' }, config, (phase) => phases.push(phase), {
    research: async () => { throw new Error('offline') },
    saveResearch: async () => { throw new Error('unexpected save') },
    createModel: () => { throw new Error('unexpected model') }
  }), ResearchUnavailableError)
  assert.deepEqual(phases, ['research'])
  assert.deepEqual(await listDrafts(root), [])
}))

test('内容流程保留成功的平台，并在来源记录保存失败时返回警告', () => withRoot(async (root) => {
  const { generateContent } = await import('../src/main/features/content/content-service')
  const config = { draftsDirectory: root, apiUrl: 'https://example.com', model: 'test', apiKey: 'test' }
  const phases: string[] = []
  const result = await generateContent({ title: '流程测试', audience: '', platforms: ['小红书', '公众号'], research: 'skip' }, config, (phase) => phases.push(phase), {
    research: async () => { throw new Error('unexpected research') },
    saveResearch: async () => { throw new Error('disk error') },
    createModel: () => async (system) => {
      if (system.includes('共同策划')) return JSON.stringify({ commonFacts: '事实', pending: [], platforms: { 小红书: '计划', 公众号: '计划' } })
      if (system.includes('本次只写 小红书')) return '# 结果'
      throw new Error('failed')
    }
  })
  assert.deepEqual(result.draft?.platforms, ['小红书'])
  assert.equal(result.failures[0].platform, '公众号')
  assert.ok(result.warnings?.some((warning) => warning.includes('核查资料保存失败')))
  assert.equal((await readDraft(root, '流程测试', '小红书')).content, '# 结果\n')
  assert.deepEqual(phases, ['plan', 'write', 'review', 'save'])
}))

test('配图生成运行期间拒绝同一平台的重复请求，结束后允许重试', async () => {
  const { generateImageSet } = await import('../src/main/features/images/image-service')
  const config = { draftsDirectory: '/workspace', apiUrl: 'https://example.com', model: 'test', apiKey: 'test' }
  const request = { id: '主题', platform: '小红书' as const, version: 'version', count: 2 }
  let release: (() => void) | undefined
  let started: (() => void) | undefined
  const ready = new Promise<void>((resolve) => { started = resolve })
  const pending = new Promise<void>((resolve) => { release = resolve })
  const deps = {
    getImageSettings: async () => config,
    getRuntimeSettings: async () => config,
    readDraft: async () => ({ content: '文案', version: 'version' }),
    createTextModel: () => async () => JSON.stringify(['封面', '内页']),
    generateImages: async () => { started?.(); await pending; return { images: [], failures: [] } },
    requestImage: async () => Buffer.alloc(0)
  }
  const first = generateImageSet(request, deps)
  await ready
  await assert.rejects(generateImageSet(request, deps), /正在为此平台生成图片/)
  release?.()
  await first
  await assert.doesNotReject(generateImageSet(request, deps))
})
