import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
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
test('删除配图只移动当前平台指定的文件，并拒绝路径越界', () => withRoot(async root => {
  const { saveImage, listImages, removeImage } = await import('../src/main/features/images/image-store')
  const { rename } = await import('node:fs/promises')
  const id = await createTopic(root, '删除配图')
  await createPlatform(root, id, '小红书', '正文')
  await createPlatform(root, id, '公众号', '正文')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
  const image = await saveImage(root, id, '小红书', 0, png)
  const other = await saveImage(root, id, '公众号', 0, png)
  const trash = join(root, '回收图片.png')
  await assert.rejects(removeImage(root, id, '小红书', '../其他.png', async () => { throw new Error('不应调用') }), /名称无效/)
  await removeImage(root, id, '小红书', image.name, path => rename(path, trash))
  assert.deepEqual(await listImages(root, id, '小红书'), [])
  assert.equal((await listImages(root, id, '公众号'))[0].name, other.name)
  assert.deepEqual(await readFile(trash), png)
  await assert.rejects(removeImage(root, id, '小红书', image.name, async () => {}), /找不到/)
}))
test('单张和批量下载保留原图，只导出当前平台并保护同名文件', () => withRoot(async root => {
  const { saveImage, downloadImage, downloadImageToDirectory, downloadImages } = await import('../src/main/features/images/image-store')
  const id = await createTopic(root, '下载主题')
  await createPlatform(root, id, '小红书', '正文')
  await createPlatform(root, id, '公众号', '正文')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
  const cover = await saveImage(root, id, '小红书', 0, png)
  const illustration = await saveImage(root, id, '小红书', 1, png)
  await saveImage(root, id, '公众号', 2, png)
  const dest = join(root, '下载')
  await mkdir(dest)
  const single = join(dest, cover.name)
  await assert.rejects(downloadImage(root, id, '小红书', '../封面.png', single), /名称无效/)
  await assert.rejects(downloadImage(root, id, '公众号', illustration.name, single), /找不到/)
  assert.deepEqual(await downloadImage(root, id, '小红书', cover.name, single), { saved: 1, failed: 0 })
  assert.deepEqual(await readFile(single), png)
  await assert.rejects(downloadImage(root, id, '小红书', cover.name, single), { code: 'EEXIST' })
  assert.deepEqual(await downloadImageToDirectory(root, id, '小红书', cover.name, dest), { saved: 1, failed: 0 })
  assert.deepEqual(await readFile(join(dest, '01-封面（2）.png')), png)
  assert.deepEqual(await readFile(single), png)

  const batch = join(dest, '下载主题-小红书配图')
  assert.deepEqual(await downloadImages(root, id, '小红书', dest), { saved: 2, failed: 0 })
  assert.deepEqual((await readdir(batch)).sort(), [cover.name, illustration.name])
  await writeFile(join(root, id, '小红书', '图片', illustration.name), '损坏的图片')
  assert.deepEqual(await downloadImages(root, id, '小红书', dest), { saved: 1, failed: 1 })
  assert.deepEqual(await readdir(`${batch}（2）`), [cover.name])
  assert.deepEqual(await readFile(join(batch, illustration.name)), png)
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
  const { saveResearch, readResearch } = await import('../src/main/features/research/research')
  const id = await createTopic(root, '核查')
  await createPlatform(root, id, '小红书', '# 发布内容')
  const results = [{ title: '人社指南', url: 'https://example.gov.cn/guide', retrievedAt: '2026-11-18T00:00:00.000Z', fetched: false }]
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
  const call = async (system: string, user: string) => { calls.push({ system, user }); return calls.length === 1 ? JSON.stringify({ commonFacts: '官方事实', pending: ['核查时间'], platforms: { 小红书: '场景入口', 公众号: '深度解释' } }) : JSON.stringify({ title: '示例标题', content: '示例文案' }) }
  const plan = await planContent(call, '主题', '受众', ['小红书', '公众号'], [source])
  await writeContent(call, '主题', '受众', '公众号', plan, [source])
  assert.match(calls[0].user, /官方事实/); assert.match(calls[1].user, /深度解释/); assert.match(calls[1].system, /公众号/)
  assert.deepEqual(plan.pending, ['核查时间'])
})
test('无逐条来源的联网摘要会再次检索复核周期，失败时保留原摘要并标注', async () => {
  const { researchTopic } = await import('../src/main/features/research/research')
  const config = { apiUrl: 'https://example.com', model: 'test', apiKey: 'key' }
  const source = { title: '原公告', url: 'https://example.com/a', retrievedAt: '2026-11-20', fetched: false, origin: 'model_search_unlinked' as const, text: '', searchSummary: '原摘要' }
  const audit = { ...source, url: 'https://example.com/b', searchSummary: '复核：年度不符' }
  let calls = 0
  const search = async (_config: typeof config, topic: string) => { if (++calls === 1) return [source]; assert.match(topic, /区分本期与往期/); assert.match(topic, /原摘要/); return [audit] }
  const result = await researchTopic(config, '采暖', undefined, search)
  assert.equal(calls, 2); assert.equal(result.length, 2)
  assert.match(result[0].searchSummary ?? '', /复核：年度不符/); assert.match(result[0].searchSummary ?? '', /原摘要/)
  calls = 0
  const fallback = await researchTopic(config, '采暖', undefined, async () => { if (++calls === 1) return [source]; throw new Error('offline') })
  assert.match(fallback[0].searchSummary ?? '', /复核未完成/)
})

test('策划兼容完整对象末尾多出的一个右括号，仍拒绝无效或多余内容', async () => {
  const { planContent } = await import('../src/main/features/content/content-pipeline')
  const value = { commonFacts: '事实含 } 字符', pending: [], platforms: { 小红书: '计划' } }
  const json = JSON.stringify(value)
  for (const raw of [json, `${json}}`, `以下是策划结果：${json}`, `以下是策划结果：${json}}`, `\`\`\`json\n${json}}\n\`\`\``]) {
    const result = await planContent(async () => raw, '主题', '', ['小红书'], [])
    assert.equal(result.commonFacts, value.commonFacts)
  }
  for (const raw of [`${json}}}`, `${json}说明`, `${'前'.repeat(1001)}${json}`,  '{"commonFacts":']) {
    await assert.rejects(planContent(async () => raw, '主题', '', ['小红书'], []))
  }
  let attempts = 0
  const recovered = await planContent(async () => ++attempts === 1 ? '无效输出' : json, '主题', '', ['小红书'], [])
  assert.equal(attempts, 2); assert.equal(recovered.commonFacts, value.commonFacts)
  let schemaAttempts = 0
  const recoveredSchema = await planContent(async () => ++schemaAttempts === 1 ? JSON.stringify({ ...value, platforms: { 小红书: { outline: '计划' } } }) : json, '主题', '', ['小红书'], [])
  assert.equal(schemaAttempts, 1); assert.match(recoveredSchema.platforms.小红书 ?? '', /计划/)
  await assert.rejects(planContent(async () => '{"commonFacts":"事实"}}', '主题', '', ['小红书'], []))
})

test('平台差异检查无法完成时保留原文并提示；有建议时仅调整对应平台', async () => {
  const { reviewVersions } = await import('../src/main/features/content/content-pipeline')
  const original = { 小红书: '小红书原文', 公众号: '公众号原文' }
  const failed = await reviewVersions(async () => { throw new Error('offline') }, original)
  assert.deepEqual(failed.drafts, original); assert.ok(failed.warnings.length)
  let calls = 0
  const revised = await reviewVersions(async () => ++calls === 1 ? JSON.stringify({ 小红书: '', 公众号: '补充依据' }) : '公众号修改版', original)
  assert.equal(revised.drafts.公众号, '公众号修改版'); assert.equal(revised.drafts.小红书, original.小红书)
})
test('单平台自查后按资料和写作规则改进，失败时保留初稿', async () => {
  const { reviewVersions } = await import('../src/main/features/content/content-pipeline')
  const original = { 抖音图文: '初稿' }
  const calls: { system: string; user: string }[] = []
  const context = { title: '主题', audience: '读者', plan: { commonFacts: '已有依据', pending: ['核查地域'], platforms: { 抖音图文: '计划' } }, sources: [] }
  const result = await reviewVersions(async (system, user) => {
    calls.push({ system, user })
    return calls.length === 1 ? JSON.stringify({ 抖音图文: '解释适用条件和原因' }) : '改进后的完整文案'
  }, original, { 抖音图文: '自定义格式' }, context)
  assert.equal(result.drafts.抖音图文, '改进后的完整文案')
  assert.deepEqual(result.warnings, [])
  assert.match(calls[0].system, /原因分析/); assert.match(calls[0].user, /自定义格式/)
  assert.match(calls[1].user, /已有依据/); assert.match(calls[1].user, /核查地域/)
  const failed = await reviewVersions(async () => { throw new Error('offline') }, original)
  assert.deepEqual(failed.drafts, original); assert.match(failed.warnings[0], /内容检查未完成/)
  let count = 0
  const rewriteFailed = await reviewVersions(async () => ++count === 1 ? JSON.stringify({ 抖音图文: '补充分析' }) : '', original)
  assert.deepEqual(rewriteFailed.drafts, original); assert.match(rewriteFailed.warnings[0], /改进未完成/)
})

test('多平台检查分别处理反馈，缺失或无效反馈不会丢失初稿', async () => {
  const { reviewVersions } = await import('../src/main/features/content/content-pipeline')
  const original = { 小红书: '初稿一', 公众号: '初稿二', 抖音图文: '初稿三' }
  let count = 0
  const result = await reviewVersions(async (system) => {
    if (++count === 1) { assert.match(system, /过于相似/); return JSON.stringify({ 小红书: '改善表达', 公众号: 123 }) }
    return '修订一'
  }, original)
  assert.deepEqual(result.drafts, { ...original, 小红书: '修订一' })
  assert.equal(result.warnings.length, 2)
  assert.match(result.warnings.join(' '), /公众号/); assert.match(result.warnings.join(' '), /抖音图文/)
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
  await assert.rejects(generateContent({ title: '联网失败', audience: '', instruction: '本次使用问答', platforms: ['小红书'], research: 'online' }, config, (phase) => phases.push(phase), {
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
      if (system.includes('为 小红书 生成标题和正文')) return JSON.stringify({ title: '小红书标题', content: '结果' })
      throw new Error('failed')
    }
  })
  assert.deepEqual(result.draft?.platforms, ['小红书'])
  assert.equal(result.failures[0].platform, '公众号')
  assert.ok(result.warnings?.some((warning) => warning.includes('核查资料保存失败')))
  assert.equal((await readDraft(root, '流程测试', '小红书')).content, '结果\n')
  assert.deepEqual(phases, ['plan', 'write', 'review', 'save'])
}))

test('单平台文章生成保存自查后的文案', () => withRoot(async (root) => {
  const { generateContent } = await import('../src/main/features/content/content-service')
  const config = { draftsDirectory: root, apiUrl: 'https://example.com', model: 'test', apiKey: 'test' }
  const phases: string[] = []
  const result = await generateContent({ title: '单平台自查', audience: '读者', platforms: ['公众号'], research: 'skip' }, config, phase => phases.push(phase), {
    research: async () => [], saveResearch: async () => {},
    createModel: () => async (system) => {
      if (system.includes('共同策划')) return JSON.stringify({ commonFacts: '依据', pending: [], platforms: { 公众号: '计划' } })
      if (system.includes('生成标题和正文')) return JSON.stringify({ title: '公众号标题', content: '简短初稿' })
      if (system.includes('检查各平台')) return JSON.stringify({ 公众号: '解释适用条件' })
      if (system.includes('根据检查建议')) return '包含分析的完整文案'
      throw new Error('unexpected call')
    }
  })
  assert.equal(result.draft?.id, '单平台自查')
  assert.deepEqual(result.warnings, [])
  assert.equal((await readDraft(root, '单平台自查', '公众号')).content, '包含分析的完整文案\n')
  assert.deepEqual(phases, ['plan', 'write', 'review', 'save'])
}))

test('生成记录保留本次规则、初稿、审查建议和结果', () => withRoot(async root => {
  const { generateContent } = await import('../src/main/features/content/content-service')
  const { readPlatformResearch, savePlatformResearch } = await import('../src/main/features/research/research')
  await generateContent({ title: '记录测试', audience: '', instruction: '面向租客', platforms: ['小红书'], research: 'skip' }, { draftsDirectory: root, apiUrl: 'https://example.com', model: 'test', apiKey: 'secret', platformPrompts: { 小红书: '自然口吻' }, titlePrompts: { 小红书: '标题写实' } }, () => {}, {
    research: async () => [], saveResearch: savePlatformResearch,
    createModel: () => async system => {
      if (system.includes('共同策划')) return JSON.stringify({ commonFacts: '事实', pending: [], platforms: { 小红书: '策划' } })
      if (system.includes('生成标题和正文')) return JSON.stringify({ title: '标题', content: '初稿' })
      if (system.includes('检查各平台')) return JSON.stringify({ 小红书: '修正时间' })
      return '修改后正文'
    }
  })
  const record = await readPlatformResearch(root, '记录测试', '小红书')
  assert.equal(record?.trace?.platformPrompt, '自然口吻')
  assert.equal(record?.trace?.titlePrompt, '标题写实')
  assert.equal(record?.trace?.instruction, '面向租客')
  assert.equal(record?.trace?.initialContent, '初稿')
  assert.equal(record?.trace?.reviewFeedback, '修正时间')
  assert.equal(record?.trace?.finalContent, '修改后正文\n')
  assert.doesNotMatch(JSON.stringify(record), /secret/)
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

test('选题流程报告真实来源，过滤无效来源和重复候选并保留输入', async () => {
  const { generateTopics } = await import('../src/main/features/topics/topic-service')
  const source = { title: '来源', url: 'https://example.com/a', retrievedAt: '2026-11-18', fetched: false, text: '资料摘要' }
  const phases: string[] = []
  const request = { direction: '社保', audience: '离职者', platforms: ['公众号', '小红书'] as ('公众号' | '小红书')[] }
  const result = await generateTopics(request, false, 'run1', (event) => phases.push(event.phase), {
    research: async (_query, progress) => { progress?.('read', [source]); return [source] },
    call: async (_system, input) => {
      assert.match(input, /资料摘要/)
      return JSON.stringify([
        { title: '如何查询', angle: '查询方法', reason: '方便读者', platforms: ['小红书', '无效'], sourceIndexes: [1, 2, 1], pending: ['核查入口'] },
        { title: '如何查询！', angle: '重复', reason: '重复' },
        { title: '无角度', angle: '', reason: '无效' }
      ])
    }
  })
  assert.equal(result.status, 'completed')
  if (result.status !== 'completed') return
  assert.deepEqual(phases, ['search', 'read', 'generate', 'organize'])
  assert.deepEqual(result.batch.request.platforms, ['公众号', '小红书'])
  assert.deepEqual(result.batch.candidates[0].platforms, ['小红书'])
  assert.deepEqual(result.batch.candidates[0].sourceIndexes, [1])
  assert.equal(result.batch.candidates.length, 1)
  assert.ok(result.warning)
})

test('选题搜索失败可选择跳过并生成，空结果不视为成功', async () => {
  const { generateTopics } = await import('../src/main/features/topics/topic-service')
  const request = { direction: '社保', audience: '', platforms: ['小红书' as const] }
  let calls = 0
  const deps = { research: async () => { throw new Error('offline') }, call: async () => { calls++; return JSON.stringify([{ title: '主题', angle: '角度', reason: '理由', sourceIndexes: [1] }]) } }
  const failed = await generateTopics(request, false, 'r1', () => {}, deps)
  assert.equal(failed.status, 'research_failed'); assert.equal(calls, 0)
  const skipped = await generateTopics(request, true, 'r1', () => {}, deps)
  assert.equal(skipped.status, 'completed')
  if (skipped.status === 'completed') { assert.equal(skipped.batch.skipped, true); assert.deepEqual(skipped.batch.candidates[0].sourceIndexes, []) }
  await assert.rejects(generateTopics(request, true, 'r2', () => {}, { ...deps, call: async () => '[]' }))
})

test('创作策划接收选题角度，旧请求仍可不传角度', async () => {
  const { planContent } = await import('../src/main/features/content/content-pipeline')
  const inputs: string[] = []
  const call = async (_system: string, user: string) => { inputs.push(user); return JSON.stringify({ commonFacts: '', pending: [], platforms: { 小红书: '计划' } }) }
  await planContent(call, '主题', '', ['小红书'], [], '从查询入手')
  await planContent(call, '主题', '', ['小红书'], [])
  assert.match(inputs[0], /创作角度：从查询入手/)
  assert.match(inputs[1], /创作角度：未指定/)
})

test('工作空间目录支持嵌套、分类和删除后保留草稿', () => withRoot(async (root) => {
  const { changeWorkspaceIndex, readWorkspaceIndex } = await import('../src/main/features/workspace/workspace-index')
  const id = await createTopic(root, '分类草稿')
  await createPlatform(root, id, '小红书', '正文')
  let index = await changeWorkspaceIndex(root, { type: 'create', name: '文章', parentId: null })
  const parent = index.folders[0].id
  index = await changeWorkspaceIndex(root, { type: 'create', name: '子目录', parentId: parent })
  const child = index.folders[1].id
  await changeWorkspaceIndex(root, { type: 'moveDraft', draftId: id, folderId: child })
  await assert.rejects(changeWorkspaceIndex(root, { type: 'create', name: '文章', parentId: null }), /同级/)
  await changeWorkspaceIndex(root, { type: 'rename', id: child, name: '新名称' })
  index = await changeWorkspaceIndex(root, { type: 'delete', id: parent })
  assert.deepEqual(index.folders, [])
  assert.equal(index.assignments[id], undefined)
  assert.equal((await readDraft(root, id, '小红书')).content, '正文')
  assert.deepEqual((await readWorkspaceIndex(root)).folders, [])
}))

test('加密备份完整恢复文件，错误密码与篡改不能读取', () => withRoot(async (root) => {
  const { createBackup, decodeBackup, restoreBackup } = await import('../src/main/features/workspace/backup')
  const source = join(root, 'source'), destination = join(root, 'destination')
  await mkdir(join(source, '主题', '图片'), { recursive: true }); await mkdir(destination)
  await writeFile(join(source, '主题', '发布文案.md'), '内容')
  await writeFile(join(source, '主题', '图片', '图.png'), Buffer.from([0, 1, 255]))
  const settings = { apiUrl: 'https://example.com', model: 'model', apiKey: 'secret', imageService: 'shared' as const, imageApiUrl: '', imageModel: '', imageApiKey: '' }
  const bytes = await createBackup(source, settings, 'test-password')
  assert.equal(bytes.includes(Buffer.from('secret')), false)
  await assert.rejects(decodeBackup(bytes, 'wrong-password'), /密码错误/)
  const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1
  await assert.rejects(decodeBackup(changed, 'test-password'), /密码错误/)
  const snapshot = await decodeBackup(bytes, 'test-password'); assert.equal(snapshot.settings.apiKey, 'secret')
  await restoreBackup(snapshot, destination)
  assert.equal(await readFile(join(destination, '主题', '发布文案.md'), 'utf8'), '内容')
  assert.deepEqual(await readFile(join(destination, '主题', '图片', '图.png')), Buffer.from([0, 1, 255]))
}))

test('工作空间目录彼此隔离，旧草稿默认未分类', () => withRoot(async (root) => {
  const { changeWorkspaceIndex, readWorkspaceIndex } = await import('../src/main/features/workspace/workspace-index')
  const one = join(root, 'one'), two = join(root, 'two'); await mkdir(one); await mkdir(two)
  const draft = await createTopic(one, '已有草稿'); await createPlatform(one, draft, '小红书', '正文')
  const before = await readWorkspaceIndex(one); assert.equal(before.assignments[draft], undefined)
  await changeWorkspaceIndex(one, { type: 'create', name: '分类', parentId: null })
  assert.equal((await readWorkspaceIndex(one)).folders.length, 1)
  assert.equal((await readWorkspaceIndex(two)).folders.length, 0)
}))

test('备份拒绝符号链接，防止读取工作空间外文件', () => withRoot(async (root) => {
  const { symlink } = await import('node:fs/promises')
  const { createBackup } = await import('../src/main/features/workspace/backup')
  const source = join(root, 'source'); await mkdir(source); await symlink(root, join(source, 'link'))
  const settings = { apiUrl: '', model: '', apiKey: '', imageService: 'shared' as const, imageApiUrl: '', imageModel: '', imageApiKey: '' }
  await assert.rejects(createBackup(source, settings, 'test-password'), /符号链接/)
}))

test('空白文章按所选平台创建并保留同名保护', () => withRoot(async (root) => {
  const { safeTitle } = await import('../src/main/features/drafts/draft-store')
  const request = { title: '我的文章', audience: '', platforms: ['小红书', '公众号'] as ('小红书' | '公众号')[], research: 'skip' as const }
  const result = await generateDrafts(root, request, async () => `# ${safeTitle(request.title)}`)
  assert.deepEqual(result.draft?.platforms, ['小红书', '公众号'])
  assert.equal((await readDraft(root, '我的文章', '公众号')).content, '# 我的文章\n')
  await assert.rejects(generateDrafts(root, request, async () => '# 内容'), /同名/)
}))

test('新建文章可以归入选定目录，创建失败不会覆盖已有文章', () => withRoot(async (root) => {
  const { changeWorkspaceIndex, readWorkspaceIndex } = await import('../src/main/features/workspace/workspace-index')
  const folder = (await changeWorkspaceIndex(root, { type: 'create', name: '项目', parentId: null })).folders[0]
  const request = { title: '目录文章', audience: '', platforms: ['小红书'] as '小红书'[], research: 'skip' as const }
  const result = await generateDrafts(root, request, async () => '# 目录文章')
  assert.ok(result.draft)
  await changeWorkspaceIndex(root, { type: 'moveDraft', draftId: result.draft.id, folderId: folder.id })
  assert.equal((await readWorkspaceIndex(root)).assignments[result.draft.id], folder.id)
  await assert.rejects(generateDrafts(root, request, async () => '# 重复'), /同名/)
  assert.equal((await readDraft(root, '目录文章', '小红书')).content, '# 目录文章\n')
}))

test('修改文章标题保留原有内容与目录，检查重名和外部标题变更', () => withRoot(async (root) => {
  const { changeWorkspaceIndex, readWorkspaceIndex, assertAvailableArticleTitle } = await import('../src/main/features/workspace/workspace-index')
  const first = await createTopic(root, '原始文章'); await createPlatform(root, first, '小红书', '保留的内容')
  const second = await createTopic(root, '另一篇'); await createPlatform(root, second, '公众号', '第二篇内容')
  const folder = (await changeWorkspaceIndex(root, { type: 'create', name: '目录', parentId: null })).folders[0]
  await changeWorkspaceIndex(root, { type: 'moveDraft', draftId: first, folderId: folder.id })
  const updated = await changeWorkspaceIndex(root, { type: 'renameArticle', draftId: first, title: '新的标题', expectedTitle: '原始文章' })
  assert.equal(updated.titles[first], '新的标题'); assert.equal(updated.assignments[first], folder.id)
  assert.equal((await readDraft(root, first, '小红书')).content, '保留的内容')
  assert.equal((await readWorkspaceIndex(root)).titles[first], '新的标题')
  await assert.rejects(changeWorkspaceIndex(root, { type: 'renameArticle', draftId: first, title: '别的标题', expectedTitle: '原始文章' }), /其他位置修改/)
  await assert.rejects(changeWorkspaceIndex(root, { type: 'renameArticle', draftId: first, title: '另一篇', expectedTitle: '新的标题' }), /同名/)
  await assert.rejects(assertAvailableArticleTitle(root, '新的标题'), /同名/)
  assert.equal((await readWorkspaceIndex(root)).titles[first], '新的标题')
}))

test('图片策划按文章决定四至六张正文图并贯彻所选风格', async () => {
  const { generateImageSet } = await import('../src/main/features/images/image-service')
  const config = { draftsDirectory: '/workspace', apiUrl: 'https://example.com', model: 'test', apiKey: 'test' }
  let modelPrompt = '', sentPrompt = '', planned = 0
  const deps = {
    getImageSettings: async () => config, getRuntimeSettings: async () => config,
    readDraft: async () => ({ content: '文章内容', version: 'version' }),
    createTextModel: () => async (system: string) => { modelPrompt = system; return JSON.stringify(['封面', '正文一', '正文二', '正文三', '正文四', '正文五']) },
    generateImages: async (_root: string, _request: unknown, prompts: string[], generate: (prompt: string) => Promise<Buffer>) => { planned = prompts.length; await generate(prompts[0]); return { images: [], failures: [] } },
    requestImage: async (_config: unknown, prompt: string) => { sentPrompt = prompt; return Buffer.alloc(0) }
  }
  await generateImageSet({ id: '风格测试', platform: '小红书', version: 'version', style: 'watercolor' }, deps)
  assert.equal(planned, 6); assert.match(modelPrompt, /4 至 6 张正文配图/); assert.match(modelPrompt, /水彩/); assert.match(sentPrompt, /水彩/)
  const tooFew = { ...deps, createTextModel: () => async () => JSON.stringify(['封面', '一', '二', '三']) }
  await assert.rejects(generateImageSet({ id: '数量测试', platform: '小红书', version: 'version', style: 'flat' }, tooFew), /配图方案生成失败/)
  const tooMany = { ...deps, createTextModel: () => async () => JSON.stringify(Array.from({ length: 8 }, (_, i) => `图片${i}`)) }
  await assert.rejects(generateImageSet({ id: '数量上限', platform: '小红书', version: 'version', style: 'flat' }, tooMany), /配图方案生成失败/)
})

test('图片风格在文章元数据中保存且兼容旧工作空间', () => withRoot(async (root) => {
  const { changeWorkspaceIndex, readWorkspaceIndex } = await import('../src/main/features/workspace/workspace-index')
  const id = await createTopic(root, '图片风格'); await createPlatform(root, id, '小红书', '内容')
  assert.deepEqual(Object.keys((await readWorkspaceIndex(root)).imageStyles), [])
  await changeWorkspaceIndex(root, { type: 'setImageStyle', draftId: id, style: 'handdrawn' })
  assert.equal((await readWorkspaceIndex(root)).imageStyles[id], 'handdrawn')
}))

test('文章优化只返回候选，外部版本变化时拒绝结果', async () => {
  const { optimizeContent } = await import('../src/main/features/content/optimize')
  const input = { id: '主题', platform: '公众号' as const, version: 'v1', content: '原文', instruction: '更简洁' }
  let calls = 0
  const result = await optimizeContent(input, { read: async () => ({ content: '原文', version: 'v1' }), call: async (_system, user) => { assert.match(user, /更简洁/); return '候选' } })
  assert.equal(result, '候选\n')
  await assert.rejects(optimizeContent(input, { read: async () => ({ content: '原文', version: ++calls === 1 ? 'v1' : 'v2' }), call: async () => '候选' }), /外部修改/)
})

test('优化要求留空时按平台规则整体优化，填写时以本次要求为重点', async () => {
  const { optimizeContent } = await import('../src/main/features/content/optimize')
  const calls: { system: string; user: string }[] = []
  const deps = { read: async () => ({ content: '原文', version: 'v1' }), platformPrompts: { 小红书: '使用自然口吻和表情', 公众号: '公众号写作规则' }, call: async (system: string, user: string) => { calls.push({ system, user }); return '候选' } }
  const input = { id: '文章', platform: '小红书' as const, version: 'v1', content: '原文', instruction: '' }
  await optimizeContent(input, deps)
  await optimizeContent({ ...input, instruction: '  不使用表情  ' }, deps)
  assert.match(calls[0].system, /根据平台规则优化原文/)
  assert.match(calls[0].user, /平台写作要求：使用自然口吻和表情/)
  assert.doesNotMatch(calls[0].user, /本次优化要求/)
  assert.doesNotMatch(calls[0].user, /公众号写作规则/)
  assert.match(calls[1].system, /根据本次优化要求修改原文/)
  assert.match(calls[1].system, /与平台规则冲突时，本次要求优先/)
  assert.match(calls[1].user, /本次优化要求：不使用表情/)
  assert.match(calls[1].user, /原文：\n原文/)
})

test('点击文章先保存两侧未保存内容，再读取目标各平台', async () => {
  const { prepareArticleOpen } = await import('../src/renderer/src/features/reopen-article')
  let docs: Record<string, { content: string; savedContent: string; version: string }> = { '当前:小红书': { content: '本地', savedContent: '旧', version: 'v1' }, '目标:公众号': { content: '目标编辑', savedContent: '旧目标', version: 'v2' } }
  const calls: string[] = []
  await prepareArticleOpen('当前', { id: '目标', title: '目标', platforms: ['公众号', '小红书'] }, {
    getDocuments: () => docs, updateDocuments: (f) => { docs = f(docs) },
    save: async (id, platform, content) => { calls.push(`save:${id}:${platform}`); return { ok: true, value: { content, version: 'new' } } },
    read: async (id, platform) => { calls.push(`read:${id}:${platform}`); return { ok: true, value: { content: `${platform}最新`, version: 'read' } } }
  })
  assert.deepEqual(calls.slice(0, 2), ['save:当前:小红书', 'save:目标:公众号'])
  assert.equal(docs['当前:小红书'].savedContent, '本地'); assert.equal(docs['目标:公众号'].content, '公众号最新'); assert.equal(docs['目标:小红书'].version, 'read')
})

test('点击文章保存失败或读取期间出现修改时，不替换目标内容', async () => {
  const { prepareArticleOpen } = await import('../src/renderer/src/features/reopen-article')
  let docs: Record<string, { content: string; savedContent: string; version: string }> = { '当前:小红书': { content: '未保存', savedContent: '旧', version: 'v1' }, '目标:公众号': { content: '目标原样', savedContent: '目标原样', version: 'v2' } }
  const target = { id: '目标', title: '目标', platforms: ['公众号' as const] }
  const update = (f: (value: typeof docs) => typeof docs) => { docs = f(docs) }
  await assert.rejects(prepareArticleOpen('当前', target, { getDocuments: () => docs, updateDocuments: update, save: async () => ({ ok: false, error: '版本冲突' }), read: async () => { throw new Error('不应读取') } }), /版本冲突/)
  assert.equal(docs['当前:小红书'].content, '未保存'); assert.equal(docs['目标:公众号'].content, '目标原样')
  docs['当前:小红书'].savedContent = '未保存'
  await assert.rejects(prepareArticleOpen('当前', target, { getDocuments: () => docs, updateDocuments: update, save: async () => { throw new Error('不应保存') }, read: async () => { docs['目标:公众号'].content = '读取期间编辑'; return { ok: true, value: { content: '磁盘内容', version: 'v3' } } } }), /新的修改/)
  assert.equal(docs['目标:公众号'].content, '读取期间编辑')
})

test('旧工作空间元数据可读取并新增图片风格', () => withRoot(async (root) => {
  const { changeWorkspaceIndex, readWorkspaceIndex } = await import('../src/main/features/workspace/workspace-index')
  const id = await createTopic(root, '旧文章'); await createPlatform(root, id, '小红书', '原文')
  await writeFile(join(root, '.post-agents-workspace.json'), JSON.stringify({ version: 1, folders: [], assignments: {}, titles: { [id]: '旧标题' } }))
  assert.equal((await readWorkspaceIndex(root)).titles[id], '旧标题')
  await changeWorkspaceIndex(root, { type: 'setImageStyle', draftId: id, style: 'minimal' })
  const index = await readWorkspaceIndex(root); assert.equal(index.titles[id], '旧标题'); assert.equal(index.imageStyles[id], 'minimal')
}))

test('各平台规则支持默认值、单独覆盖、恢复默认及长度校验', async () => {
  const { defaultPlatformPrompts, resolvePlatformPrompts, compactPlatformPrompts, isPlatformPrompts } = await import('../src/shared/platform-prompts')
  const prompts = resolvePlatformPrompts({ 小红书: '简洁清单', 公众号: '   ' })
  assert.equal(prompts.小红书, '简洁清单'); assert.equal(prompts.公众号, defaultPlatformPrompts.公众号)
  assert.deepEqual(compactPlatformPrompts({ 小红书: defaultPlatformPrompts.小红书, 公众号: ' 自定义规则 ' }), { 公众号: '自定义规则' })
  assert.equal(isPlatformPrompts({ 小红书: 'x'.repeat(4001) }), false)
  assert.equal(isPlatformPrompts({ 不存在: '规则' }), false)
  assert.equal(isPlatformPrompts({ 公众号: '正常规则' }), true)
})

test('小红书自定义规则贯穿生成和检查，不强制固定人设', async () => {
  const { planContent, writeContent, reviewVersions } = await import('../src/main/features/content/content-pipeline')
  const calls: { system: string; user: string }[] = []
  const call = async (system: string, user: string) => {
    calls.push({ system, user })
    if (system.includes('共同策划')) return JSON.stringify({ commonFacts: '', pending: [], platforms: { 小红书: '计划' } })
    if (system.includes('检查各平台')) return JSON.stringify({ 小红书: '改进' })
    if (system.includes('生成标题和正文')) return JSON.stringify({ title: '标题', content: '正文' })
    return '# 文案'
  }
  const prompts = { 小红书: '语气正式，不用姐妹' }
  const instruction = '这次使用问答形式'
  const plan = await planContent(call, '主题', '', ['小红书'], [], undefined, prompts, instruction)
  await writeContent(call, '主题', '', '小红书', plan, [], prompts, instruction)
  await reviewVersions(call, { 小红书: '初稿' }, prompts, { title: '主题', audience: '', plan, sources: [], instruction })
  for (const { system, user } of calls) {
    assert.match(user, /语气正式，不用姐妹/)
    assert.match(user, /这次使用问答形式/)
    assert.match(system, /本次要求与平台写作要求冲突时，以本次要求为准/)
    assert.doesNotMatch(system, /像小姐妹|热心小姐妹|使用“姐妹”/)
  }
  for (const { system } of calls.slice(1)) {
    assert.match(system, /不是输出内部策划或核查报告/)
    assert.match(system, /待核清单是内部参考/)
  }
  assert.match(calls[3].system, /检查建议只用于修正问题/)
  assert.ok(calls[3].user.lastIndexOf('平台写作要求：') > calls[3].user.lastIndexOf('原文：'))
})

test('平台自定义规则用于策划、写作、调整和优化且不覆盖通用事实要求', async () => {
  const { planContent, writeContent, reviewVersions } = await import('../src/main/features/content/content-pipeline')
  const { optimizeContent } = await import('../src/main/features/content/optimize')
  const prompts = { 小红书: '使用三段清单', 公众号: '使用深入问答' }
  const calls: { system: string; user: string }[] = []
  const call = async (system: string, user: string) => {
    calls.push({ system, user })
    if (system.includes('共同策划')) return JSON.stringify({ commonFacts: '事实', pending: [], platforms: { 小红书: '计划', 公众号: '计划' } })
    if (system.includes('检查各平台')) return JSON.stringify({ 小红书: '', 公众号: '调整表达' })
    if (system.includes('生成标题和正文')) return JSON.stringify({ title: '标题', content: '正文' })
    return '# 候选'
  }
  const plan = await planContent(call, '主题', '', ['小红书', '公众号'], [], undefined, prompts)
  await writeContent(call, '主题', '', '小红书', plan, [], prompts)
  await reviewVersions(call, { 小红书: '内容甲', 公众号: '内容乙' }, prompts)
  await optimizeContent({ id: '主题', platform: '公众号', version: 'v1', content: '原文', instruction: '' }, { read: async () => ({ content: '原文', version: 'v1' }), call, platformPrompts: prompts })
  assert.match(calls[0].user, /使用三段清单/); assert.match(calls[0].user, /使用深入问答/)
  assert.match(calls[1].user, /使用三段清单/); assert.doesNotMatch(calls[1].user, /使用深入问答/)
  assert.match(calls[1].system, /禁止编造/); assert.match(calls[3].user, /使用深入问答/); assert.match(calls[4].user, /使用深入问答/)
})

test('加密备份保存平台自定义规则，旧备份仍可读取', () => withRoot(async (root) => {
  const { createBackup, decodeBackup } = await import('../src/main/features/workspace/backup')
  const base = { apiUrl: '', model: '', apiKey: '', imageService: 'shared' as const, imageApiUrl: '', imageModel: '', imageApiKey: '' }
  const current = await decodeBackup(await createBackup(root, { ...base, platformPrompts: { 公众号: '自定义规则' }, titlePrompts: { 公众号: '标题规则' } }, 'test-password'), 'test-password')
  assert.equal(current.settings.platformPrompts?.公众号, '自定义规则')
  assert.equal(current.settings.titlePrompts?.公众号, '标题规则')
  const legacy = await decodeBackup(await createBackup(root, base, 'test-password'), 'test-password')
  assert.equal(legacy.settings.platformPrompts, undefined)
}))

test('文章生成流程使用当前配置的平台规则', () => withRoot(async (root) => {
  const { generateContent } = await import('../src/main/features/content/content-service')
  const calls: { system: string; user: string }[] = []
  const config = { draftsDirectory: root, apiUrl: 'https://example.com', model: 'test', apiKey: 'test', platformPrompts: { 公众号: '以问答形式解释问题' } }
  const result = await generateContent({ title: '自定义写作', audience: '', platforms: ['公众号'], research: 'skip' }, config, () => {}, {
    research: async () => { throw new Error('不应联网') },
    saveResearch: async () => {},
    createModel: () => async (system, user) => { calls.push({ system, user }); return system.includes('共同策划') ? JSON.stringify({ commonFacts: '', pending: [], platforms: { 公众号: '计划' } }) : JSON.stringify({ title: '平台标题', content: '生成结果' }) }
  })
  assert.equal(result.draft?.id, '自定义写作')
  assert.match(calls[0].user, /以问答形式解释问题/); assert.match(calls[1].user, /以问答形式解释问题/)
}))

test('文章生成后只为成功的平台依次配图，失败保留其他平台结果', async () => {
  const { generateCreatedArticleImages } = await import('../src/main/features/images/article-images')
  const steps: string[] = [], requests: { platform: string; version: string; style?: string; count?: number }[] = []
  const notices: { count: number; partial: boolean }[] = []
  const result = await generateCreatedArticleImages({ id: '主题', title: '主题', platforms: ['小红书', '公众号', '抖音图文'] }, 'watercolor', {
    onProgress: (message) => { steps.push(message) },
    onComplete: (count, partial) => { notices.push({ count, partial }) },
    read: async (_id, platform) => platform === '公众号' ? { ok: false, error: '读取失败' } : { ok: true, value: { content: '文章', version: `version-${platform}` } },
    generate: async (request) => {
      requests.push(request)
      return request.platform === '小红书' ? { ok: true, value: { images: [{ name: '封面', dataUrl: 'data:image/png;base64,AA==' }], failures: [{ index: 2, error: '失败' }] } } : { ok: true, value: { images: [], failures: [] } }
    }
  })
  assert.equal(steps.length, 3); assert.equal(requests.length, 2)
  assert.deepEqual(requests.map(({ platform, version, style, count }) => ({ platform, version, style, count })), [
    { platform: '小红书', version: 'version-小红书', style: 'watercolor', count: undefined },
    { platform: '抖音图文', version: 'version-抖音图文', style: 'watercolor', count: undefined }
  ])
  assert.match(result[0], /已保存 1 张/); assert.match(result[0], /第 2 张/); assert.match(result[1], /读取失败/); assert.match(result[2], /已保存 0 张/)
  assert.deepEqual(notices, [{ count: 1, partial: true }])
})

test('生成通知区分部分成功，并且没有结果时不提示成功', async () => {
  const { generationNoticeText } = await import('../src/main/features/generation-notifications')
  assert.equal(generationNoticeText({ kind: 'topics', count: 0, partial: false }), null)
  assert.equal(generationNoticeText({ kind: 'article', count: 0, partial: true }), null)
  assert.equal(generationNoticeText({ kind: 'images', count: 0, partial: true }), null)
  assert.match(generationNoticeText({ kind: 'topics', count: 3, partial: false })!.title, /生成完成/)
  assert.match(generationNoticeText({ kind: 'article', count: 1, partial: true })!.title, /部分完成/)
  assert.match(generationNoticeText({ kind: 'images', count: 2, partial: true })!.body, /2 张/)
  assert.match(generationNoticeText({ kind: 'optimization' })!.body, /确认后再应用/)
})

test('新建文章默认不生成配图，勾选后显示四种风格预览', async () => {
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { Create } = await import('../src/renderer/src/features/Create')
  const base = { title: '', angle: '', instruction: '', audience: '', platforms: ['小红书' as const], imageStyle: 'flat' as const, generateImages: false }
  const props = { onChange: () => {}, onBack: () => {}, onCreate: async () => null, busy: false, researchFailed: false, progress: null, imageProgress: '' }
  const initial = renderToStaticMarkup(createElement(Create, { ...props, form: base }))
  assert.match(initial, /type="checkbox"/); assert.doesNotMatch(initial, /class="image-style-card"/)
  const selected = renderToStaticMarkup(createElement(Create, { ...props, form: { ...base, generateImages: true } }))
  assert.equal((selected.match(/class="image-style-card"/g) ?? []).length, 4)
  assert.match(selected, /清新扁平/); assert.match(selected, /手绘插画/); assert.match(selected, /水彩/); assert.match(selected, /极简信息图/)
  assert.doesNotMatch(initial, /创建空白文章/); assert.doesNotMatch(selected, /创建空白文章/)
})

test('自动配图服务异常后仍继续处理其余平台', async () => {
  const { generateCreatedArticleImages } = await import('../src/main/features/images/article-images')
  const platformsSeen: string[] = []
  const result = await generateCreatedArticleImages({ id: '主题', title: '主题', platforms: ['小红书', '公众号'] }, 'flat', {
    onProgress: () => {}, read: async () => ({ ok: true, value: { content: '正文', version: 'v1' } }),
    generate: async (request) => { platformsSeen.push(request.platform); if (request.platform === '小红书') throw new Error('服务不可用'); return { ok: true, value: { images: [{ name: '封面', dataUrl: 'data:image/png;base64,AA==' }], failures: [] } } }
  })
  assert.deepEqual(platformsSeen, ['小红书', '公众号']); assert.match(result[0], /生成失败/); assert.match(result[1], /已保存 1 张/)
})

test('自动配图按平台转发策划和逐张生成进度', async () => {
  const { generateCreatedArticleImages } = await import('../src/main/features/images/article-images')
  const steps: string[] = []
  await generateCreatedArticleImages({ id: '主题', platforms: ['小红书', '公众号'] }, 'flat', {
    onProgress: message => steps.push(message),
    read: async () => ({ ok: true, value: { content: '正文', version: 'v1' } }),
    generate: async (_request, progress) => {
      progress({ phase: 'planning' })
      progress({ phase: 'generating', current: 2, total: 5, completed: 1 })
      return { ok: true, value: { images: [], failures: [] } }
    }
  })
  assert.ok(steps.includes('小红书：正在策划配图'))
  assert.ok(steps.includes('小红书：正在生成第 2 / 5 张，已处理 1 张'))
  assert.ok(steps.includes('公众号：正在生成第 2 / 5 张，已处理 1 张'))
})

test('删除文章会移除所有平台及图片来源，清理元数据并保留其他文件', () => withRoot(async (root) => {
  const { deleteWorkspaceArticle, changeWorkspaceIndex, readWorkspaceIndex } = await import('../src/main/features/workspace/workspace-index')
  const { symlink, lstat } = await import('node:fs/promises')
  const id = await createTopic(root, '待删除'); await createPlatform(root, id, '小红书', '正文'); await createPlatform(root, id, '公众号', '其他平台')
  await mkdir(join(root, id, '小红书', '图片')); await writeFile(join(root, id, '小红书', '图片', '封面.png'), '图片')
  await writeFile(join(root, id, '.research.json'), '{"来源":"记录"}')
  const other = await createTopic(root, '保留文章'); await createPlatform(root, other, '小红书', '不能删除')
  await symlink(join(root, other), join(root, id, '外部链接'))
  const folder = (await changeWorkspaceIndex(root, { type: 'create', name: '目录', parentId: null })).folders[0]
  await changeWorkspaceIndex(root, { type: 'moveDraft', draftId: id, folderId: folder.id })
  await changeWorkspaceIndex(root, { type: 'renameArticle', draftId: id, title: '显示名称', expectedTitle: id })
  await changeWorkspaceIndex(root, { type: 'setImageStyle', draftId: id, style: 'watercolor' })
  const result = await deleteWorkspaceArticle(root, id)
  assert.equal(result.warning, undefined); await assert.rejects(lstat(join(root, id)), { code: 'ENOENT' })
  assert.equal((await readDraft(root, other, '小红书')).content, '不能删除')
  const index = await readWorkspaceIndex(root); assert.equal(index.assignments[id], undefined); assert.equal(index.titles[id], undefined); assert.equal(index.imageStyles[id], undefined)
  assert.deepEqual((await listDrafts(root)).map((draft) => draft.id), [other])
  await assert.rejects(deleteWorkspaceArticle(root, '../保留文章'), /路径无效/)
}))

test('删除文章时目录记录写入失败会恢复原文件，清理失败会报告剩余路径', () => withRoot(async (root) => {
  const { deleteWorkspaceArticle, changeWorkspaceIndex, readWorkspaceIndex } = await import('../src/main/features/workspace/workspace-index')
  const { readdir } = await import('node:fs/promises')
  const id = await createTopic(root, '待恢复'); await createPlatform(root, id, '小红书', '不能丢失')
  await changeWorkspaceIndex(root, { type: 'renameArticle', draftId: id, title: '名称', expectedTitle: id })
  await assert.rejects(deleteWorkspaceArticle(root, id, { writeIndex: async () => { throw new Error('write failed') }, removeTree: async () => { throw new Error('不应清理') } }), /资源已保留/)
  assert.equal((await readDraft(root, id, '小红书')).content, '不能丢失'); assert.equal((await readWorkspaceIndex(root)).titles[id], '名称')
  assert.equal((await readdir(root)).some((name) => name.startsWith('.post-agents-delete-')), false)
  const failCleanup = await deleteWorkspaceArticle(root, id, { writeIndex: async (dir, index) => { await writeFile(join(dir, '.post-agents-workspace.json'), JSON.stringify(index)) }, removeTree: async () => { throw new Error('permission denied') } })
  assert.match(failCleanup.warning ?? '', /部分本地资源未删除/)
  const staging = (await readdir(root)).find((name) => name.startsWith('.post-agents-delete-')); assert.ok(staging)
  assert.equal(await readFile(join(root, staging, 'article', '小红书', '发布文案.md'), 'utf8'), '不能丢失')
  assert.equal((await readWorkspaceIndex(root)).titles[id], undefined)
}))

test('选题记录和任务保存在各自的工作空间，旧工作空间可直接读取', async () => {
  const { readTopicWorkspace, writeTopicWorkspace } = await import('../src/main/features/topics/topic-store')
  await withRoot(async root => withRoot(async other => {
    assert.deepEqual(await readTopicWorkspace(root), { version: 1, batches: [], tasks: [] })
    const data = { version: 1 as const, batches: [{ id: 'batch-1', createdAt: '2026-11-19T00:00:00Z', batch: { request: { direction: '方向', audience: '', platforms: ['小红书' as const] }, candidates: [{ title: '选题', angle: '角度', reason: '理由', platforms: ['小红书' as const], sourceIndexes: [], pending: ['核查'] }], sources: [], skipped: true } }], tasks: [{ id: 'task-1', batchId: 'batch-1', index: 0, title: '选题', status: 'done' as const, draftId: '文章' }] }
    await writeTopicWorkspace(root, data)
    assert.deepEqual(await readTopicWorkspace(root), data)
    assert.deepEqual(await readTopicWorkspace(other), { version: 1, batches: [], tasks: [] })
    await assert.rejects(writeTopicWorkspace(root, { ...data, tasks: [{ ...data.tasks[0], status: 'invalid' }] }), /格式无效/)
    assert.deepEqual(await readTopicWorkspace(root), data)
  }))
})

test('选题数量影响模型请求、结果上限和不足提示，旧请求仍默认五条', async () => {
  const { generateTopics } = await import('../src/main/features/topics/topic-service')
  const { isTopicCount } = await import('../src/shared/topics')
  const candidates = Array.from({ length: 8 }, (_, index) => ({ title: `选题 ${index + 1}`, angle: '角度', reason: '理由' }))
  let prompt = ''
  const deps = { research: async () => [], call: async (system: string) => { prompt = system; return JSON.stringify(candidates) } }
  const request = { direction: '方向', audience: '', platforms: ['小红书' as const], count: 3 }
  const limited = await generateTopics(request, true, 'count-3', () => {}, deps)
  assert.match(prompt, /提出3个/)
  assert.equal(limited.status, 'completed')
  if (limited.status === 'completed') { assert.equal(limited.batch.candidates.length, 3); assert.equal(limited.warning, undefined); assert.equal(limited.batch.request.count, 3) }
  const short = await generateTopics({ ...request, count: 10 }, true, 'count-10', () => {}, deps)
  assert.equal(short.status, 'completed')
  if (short.status === 'completed') { assert.equal(short.batch.candidates.length, 8); assert.match(short.warning ?? '', /仅有 8 条/) }
  const legacy = await generateTopics({ direction: '方向', audience: '', platforms: ['小红书'] }, true, 'legacy', () => {}, deps)
  if (legacy.status === 'completed') assert.equal(legacy.batch.candidates.length, 5)
  for (const value of [0, 21, 1.5, '5']) assert.equal(isTopicCount(value), false)
  assert.equal(isTopicCount(1), true); assert.equal(isTopicCount(20), true)
  await assert.rejects(generateTopics({ ...request, count: 21 }, true, 'invalid', () => {}, deps), /数量无效/)
})

test('模型联网搜索使用已配置的服务和密钥，并仅接受带引用的真实搜索结果', async () => {
  const { researchWithModel } = await import('../src/main/infrastructure/model-search')
  const config = { apiUrl: 'https://model.example/v1', model: 'model-a', apiKey: 'test-key' }
  const text = '官方文件说明适用条件。'
  const payload = { status: 'completed', output: [
    { type: 'web_search_call', status: 'completed' },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text, annotations: [
      { type: 'url_citation', url: 'https://example.gov.cn/policy', title: '政策文件', start_index: 0, end_index: text.length },
      { type: 'url_citation', url: 'https://example.gov.cn/policy', title: '重复', start_index: 0, end_index: text.length },
      { type: 'url_citation', url: 'javascript:alert(1)', title: '无效', start_index: 0, end_index: text.length },
      { type: 'url_citation', url: 'http://127.0.0.1/private', title: '本地地址', start_index: 0, end_index: text.length }
    ] }] }
  ] }
  const request: typeof fetch = async (input, init) => {
    assert.equal(String(input), 'https://model.example/v1/responses')
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-key')
    const body = JSON.parse(String(init?.body)) as { model: string; tools: { type: string }[]; input: string; include: string[] }
    assert.equal(body.model, 'model-a'); assert.equal(body.tools[0].type, 'web_search'); assert.deepEqual(body.include, ['web_search_call.action.sources']); assert.match(body.input, /社保/)
    assert.equal(init?.redirect, 'error')
    return new Response(JSON.stringify(payload), { status: 200 })
  }
  const sources = await researchWithModel(config, '社保', request)
  assert.equal(sources.length, 1); assert.equal(sources[0].url, 'https://example.gov.cn/policy')
  assert.equal(sources[0].text, text); assert.equal(sources[0].origin, 'model_search'); assert.equal(sources[0].fetched, false)
  await assert.rejects(researchWithModel(config, '社保', async () => new Response('', { status: 404 })), /未接受联网搜索/)
  await assert.rejects(researchWithModel(config, '社保', async () => new Response('', { status: 401 })), /鉴权失败/)
  await assert.rejects(researchWithModel(config, '社保', async () => new Response(JSON.stringify({ status: 'completed', output: payload.output.slice(1) }))), /未返回可核查/)
  await assert.rejects(researchWithModel(config, '社保', async () => { throw new Error('offline') }), /无法连接/)
})


test('无逐条引用时保留搜索服务来源，并将综合摘要标为未对应来源', async () => {
  const { parseModelSearch } = await import('../src/main/infrastructure/model-search')
  const { evidenceText } = await import('../src/main/features/content/content-pipeline')
  const payload = { status: 'completed', output: [
    { type: 'web_search_call', status: 'completed', action: { type: 'search', sources: [{ type: 'url', url: 'https://example.gov.cn/policy' }, { type: 'url', url: 'https://other.example/info' }] } },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '模型整理的综合摘要，需要核查。', annotations: [] }] }
  ] }
  const sources = parseModelSearch(payload, '2026-11-19T00:00:00Z')
  assert.equal(sources.length, 2); assert.equal(sources[0].origin, 'model_search_unlinked')
  assert.equal(sources[0].text, ''); assert.equal(sources[1].text, '')
  assert.match(evidenceText(sources), /未逐条关联来源/)
  assert.match(evidenceText(sources), /模型整理的综合摘要/)
  assert.throws(() => parseModelSearch({ ...payload, output: payload.output.slice(0, 1) }, 'now'), /未返回可核查/)
})

test('页面路由保留带特殊字符的文章与平台，并安全处理无效参数', async () => {
  const { formatRoute, parseRoute } = await import('../src/renderer/src/features/routes')
  const route = { page: 'detail' as const, draftId: '文章 & #1 / 生活', platform: '公众号' as const }
  assert.deepEqual(parseRoute(formatRoute(route)), route)
  assert.deepEqual(parseRoute('#settings'), { page: 'settings', draftId: '', platform: null })
  assert.deepEqual(parseRoute('#unknown?draft=x&platform=不存在'), { page: 'detail', draftId: 'x', platform: null })
  assert.equal(formatRoute({ page: 'topics', draftId: '', platform: '小红书' }), '#topics')
})

test('选题任务等待用户处理时可重新发起，生成中的任务不会被覆盖', async () => {
  const { startTopicTask } = await import('../src/main/features/topics/topic-run-registry')
  const tasks = new Map<number, import('../src/main/features/topics/topic-run-registry').TopicTask>()
  const request = { direction: '方向', audience: '', platforms: ['小红书' as const], count: 5 }
  const first = { runId: 'first', request, state: 'waiting' as const }
  const next = { runId: 'next', request, state: 'running' as const }
  assert.equal(startTopicTask(tasks, 1, first), true)
  assert.equal(startTopicTask(tasks, 1, next), true)
  assert.equal(tasks.get(1)?.runId, 'next')
  assert.equal(startTopicTask(tasks, 1, first), false)
  assert.equal(tasks.get(1)?.runId, 'next')
  assert.equal(startTopicTask(tasks, 2, first), true)
})

test('选题生成任务在提交时持久化，完成后关联记录，重启时中断未完成任务', () => withRoot(async root => {
  const { writeTopicWorkspace, readTopicWorkspace } = await import('../src/main/features/topics/topic-store')
  const { markInterruptedTopicTasks } = await import('../src/shared/topics')
  const request = { direction: '新方向', audience: '', platforms: ['小红书' as const], count: 5 }
  const task = { id: 'run-1', request, createdAt: '2026-11-19T00:00:00.000Z', status: 'running' as const, phase: 'search' as const }
  const initial = { version: 1 as const, batches: [], tasks: [], topicRuns: [task] }
  await writeTopicWorkspace(root, initial)
  assert.equal((await readTopicWorkspace(root)).topicRuns?.[0].status, 'running')
  const completed = { ...initial, batches: [{ id: 'record-1', createdAt: task.createdAt, batch: { request, candidates: [], sources: [], skipped: false } }], topicRuns: [{ ...task, status: 'done' as const, recordId: 'record-1' }, { ...task, id: 'run-2', status: 'waiting' as const }] }
  await writeTopicWorkspace(root, completed)
  const restored = markInterruptedTopicTasks(await readTopicWorkspace(root))
  assert.equal(restored.topicRuns?.[0].status, 'done'); assert.equal(restored.topicRuns?.[0].recordId, 'record-1')
  assert.equal(restored.topicRuns?.[1].status, 'interrupted')
  assert.deepEqual(markInterruptedTopicTasks({ version: 1, batches: [], tasks: [] }).topicRuns, [])
  await assert.rejects(writeTopicWorkspace(root, { ...initial, topicRuns: [{ ...task, status: 'unknown' }] }), /格式无效/)
  assert.equal((await readTopicWorkspace(root)).topicRuns?.[0].status, 'done')
}))

test('选题队列最多并行三个，第四个排队并在完成后自动开始', async () => {
  const { TopicQueue } = await import('../src/main/features/topics/topic-queue')
  let data: import('../src/shared/topics').TopicWorkspace = { version: 1, batches: [], tasks: [] }
  const started: string[] = [], releases = new Map<string, () => void>(); let active = 0, peak = 0
  const waitFor = async (check: () => boolean) => { for (let i = 0; i < 200 && !check(); i++) await new Promise(resolve => setTimeout(resolve, 5)); assert.ok(check(), '等待队列状态超时') }
  const queue = new TopicQueue({
    read: async () => structuredClone(data), update: async (_root, change) => { data = change(structuredClone(data)); return structuredClone(data) }, changed: () => {},
    generate: async (request, _skip, _id, progress) => {
      started.push(request.direction); active++; peak = Math.max(peak, active); progress({ runId: request.direction, phase: 'generate' })
      await new Promise<void>(resolve => releases.set(request.direction, resolve)); active--
      return { status: 'completed', batch: { request, candidates: [], sources: [], skipped: false } }
    }
  })
  for (let i = 1; i <= 4; i++) await queue.enqueue('/workspace', { direction: `主题${i}`, audience: '', platforms: ['小红书'], count: 1 })
  await waitFor(() => started.length === 3)
  assert.equal(peak, 3); assert.deepEqual(started, ['主题1', '主题2', '主题3'])
  const reloadedView = await queue.load('/workspace')
  assert.equal(reloadedView.topicRuns?.find(t => t.request.direction === '主题1')?.status, 'running')
  assert.equal(data.topicRuns?.find(t => t.request.direction === '主题4')?.status, 'queued')
  releases.get('主题1')?.(); await waitFor(() => started.length === 4)
  assert.equal(peak, 3)
  for (const name of ['主题2', '主题3', '主题4']) releases.get(name)?.()
  await waitFor(() => data.topicRuns?.every(t => t.status === 'done') === true)
  assert.equal(data.batches.length, 4); assert.equal(peak, 3)
})

test('选题搜索失败释放位置并可手动跳过重试，重启后未完成记录保留', async () => {
  const { TopicQueue } = await import('../src/main/features/topics/topic-queue')
  let data: import('../src/shared/topics').TopicWorkspace = { version: 1, batches: [], tasks: [] }; let calls = 0
  const waitFor = async (check: () => boolean) => { for (let i = 0; i < 200 && !check(); i++) await new Promise(resolve => setTimeout(resolve, 5)); assert.ok(check()) }
  const deps: ConstructorParameters<typeof TopicQueue>[0] = {
    read: async () => structuredClone(data), update: async (_root, change) => { data = change(structuredClone(data)); return structuredClone(data) }, changed: () => {},
    generate: async (request, skip) => { calls++; return skip ? { status: 'completed', batch: { request, candidates: [], sources: [], skipped: true } } : { status: 'research_failed', error: '搜索不可用' } }
  }
  const queue = new TopicQueue(deps)
  await queue.enqueue('/workspace', { direction: '测试', audience: '', platforms: ['公众号'] })
  await waitFor(() => data.topicRuns?.[0].status === 'waiting')
  const id = data.topicRuns![0].id
  await queue.retry('/workspace', id, 'skip')
  await waitFor(() => data.topicRuns?.[0].status === 'done')
  assert.equal(calls, 2); assert.equal(data.batches[0].batch.skipped, true)
  data.topicRuns!.push({ id: 'old', request: { direction: '中断', audience: '', platforms: ['小红书'] }, createdAt: '2026-11-19', status: 'running', phase: 'search' })
  const restarted = new TopicQueue(deps)
  const loaded = await restarted.load('/workspace')
  assert.equal(loaded.topicRuns?.find(t => t.id === 'old')?.status, 'interrupted')
  assert.equal(loaded.topicRuns?.find(t => t.id === id)?.status, 'done')
})

test('结果保存失败时重试只保存已有结果，不重复调用模型', async () => {
  const { TopicQueue } = await import('../src/main/features/topics/topic-queue')
  let data: import('../src/shared/topics').TopicWorkspace = { version: 1, batches: [], tasks: [] }, failSave = true, calls = 0
  const waitFor = async (check: () => boolean) => { for (let i = 0; i < 200 && !check(); i++) await new Promise(resolve => setTimeout(resolve, 5)); assert.ok(check()) }
  const notices: number[] = []
  const queue = new TopicQueue({ read: async () => structuredClone(data), update: async (_root, change) => { const next = change(structuredClone(data)); if (failSave && next.batches.length) { failSave = false; throw new Error('disk') }; data = next; return structuredClone(data) }, changed: () => {}, completed: (count) => { notices.push(count) }, generate: async (request) => { calls++; return { status: 'completed', batch: { request, candidates: [], sources: [], skipped: false } } } })
  await queue.enqueue('/workspace', { direction: '保存测试', audience: '', platforms: ['小红书'] })
  await waitFor(() => data.topicRuns?.[0].status === 'failed')
  assert.deepEqual(notices, [])
  await queue.retry('/workspace', data.topicRuns![0].id, 'retry')
  assert.equal(data.topicRuns?.[0].status, 'done'); assert.equal(data.batches.length, 1); assert.equal(calls, 1)
  assert.deepEqual(notices, [0])
})

test('正式应用信任同一页面的路由片段，同时拒绝其他页面和查询参数', async () => {
  const { isTrustedRendererUrl } = await import('../src/main/ipc/trusted-url')
  const root = 'file:///app/renderer/index.html'
  assert.equal(isTrustedRendererUrl(`${root}#topics`, root, false), true)
  assert.equal(isTrustedRendererUrl('file:///app/renderer/other.html#topics', root, false), false)
  assert.equal(isTrustedRendererUrl(`${root}?x=1#topics`, root, false), false)
  assert.equal(isTrustedRendererUrl('https://example.com/#topics', root, false), false)
})

test('选题状态和文章任务同时保存时不会互相覆盖', () => withRoot(async root => {
  const { updateTopicWorkspace, readTopicWorkspace } = await import('../src/main/features/topics/topic-store')
  const request = { direction: '并发保存', audience: '', platforms: ['小红书' as const] }
  await Promise.all([
    updateTopicWorkspace(root, data => ({ ...data, topicRuns: [{ id: 'run', request, createdAt: '2026-11-19', status: 'queued', phase: 'search' }] })),
    updateTopicWorkspace(root, data => ({ ...data, tasks: [{ id: 'article', batchId: 'batch', index: 0, title: '文章', status: 'running' }] }))
  ])
  const data = await readTopicWorkspace(root)
  assert.equal(data.topicRuns?.[0].id, 'run'); assert.equal(data.tasks[0].id, 'article')
}))

test('无法写入任务状态时仍显示失败，并保留结果供重试保存', async () => {
  const { TopicQueue } = await import('../src/main/features/topics/topic-queue')
  let data: import('../src/shared/topics').TopicWorkspace = { version: 1, batches: [], tasks: [] }, diskFailed = false
  let release: (() => void) | undefined
  const waitFor = async (check: () => boolean) => { for (let i = 0; i < 200 && !check(); i++) await new Promise(resolve => setTimeout(resolve, 5)); assert.ok(check()) }
  const queue = new TopicQueue({ read: async () => structuredClone(data), update: async (_root, change) => { if (diskFailed) throw new Error('disk'); data = change(structuredClone(data)); return structuredClone(data) }, changed: () => {}, generate: async (request) => { await new Promise<void>(resolve => { release = resolve }); return { status: 'completed', batch: { request, candidates: [], sources: [], skipped: false } } } })
  await queue.enqueue('/workspace', { direction: '磁盘异常', audience: '', platforms: ['小红书'] })
  await waitFor(() => Boolean(release)); diskFailed = true; release?.()
  await waitFor(() => Boolean(release) && data.topicRuns?.[0].status === 'running')
  let visible = await queue.load('/workspace')
  for (let i = 0; i < 100 && visible.topicRuns?.[0].status !== 'failed'; i++) { await new Promise(resolve => setTimeout(resolve, 5)); visible = await queue.load('/workspace') }
  assert.equal(visible.topicRuns?.[0].status, 'failed'); assert.match(visible.topicRuns?.[0].message ?? '', /保存失败/)
  diskFailed = false
  await queue.retry('/workspace', visible.topicRuns![0].id, 'retry')
  assert.equal(data.topicRuns?.[0].status, 'done'); assert.equal(data.batches.length, 1)
})

test('切换平台或离开文章时，未保存内容只有在确认后才丢弃', async () => {
  const { discardUnsavedDocument } = await import('../src/renderer/src/features/document-guard')
  const original = { content: '本地修改', savedContent: '已保存内容', version: 'v1' }
  assert.equal(discardUnsavedDocument(original, () => false), null)
  assert.deepEqual(original, { content: '本地修改', savedContent: '已保存内容', version: 'v1' })
  assert.deepEqual(discardUnsavedDocument(original, () => true), { content: '已保存内容', savedContent: '已保存内容', version: 'v1' })
  const clean = { content: '已保存内容', savedContent: '已保存内容', version: 'v1' }
  assert.equal(discardUnsavedDocument(clean, () => { throw new Error('无需确认') }), clean)
})

test('新文章先创建并入队，最多三篇并行，切换页面不影响后台生成', () => withRoot(async root => {
  const { ArticleQueue } = await import('../src/main/features/content/article-queue')
  const releases: (() => void)[] = []; let active = 0, peak = 0
  const queue = new ArticleQueue({
    changed: () => {}, completed: () => {}, images: async () => [],
    generate: async (dir, request, progress, existing) => {
      active++; peak = Math.max(peak, active); progress('write')
      await new Promise<void>(resolve => { releases.push(resolve) })
      const result = await generateDrafts(dir, request, async () => '# 完成', undefined, undefined, existing)
      active--; return result
    }
  })
  const options = (title: string) => ({ request: { title, audience: '', platforms: ['小红书' as const], research: 'skip' as const }, imageStyle: 'flat' as const, generateImages: false, folderId: null })
  for (let i = 0; i < 4; i++) await queue.start(root, options(`任务${i}`))
  const waitFor = async (check: () => boolean) => { for (let i = 0; i < 200 && !check(); i++) await new Promise(resolve => setTimeout(resolve, 5)); assert.ok(check()) }
  await waitFor(() => releases.length === 3)
  assert.equal((await listDrafts(root)).length, 4); assert.equal(peak, 3)
  assert.equal((await queue.load(root)).filter(run => run.status === 'queued').length, 1)
  releases.shift()!(); await waitFor(() => releases.length === 3)
  while (releases.length) releases.shift()!()
  await waitFor(() => active === 0)
  await waitFor(() => !queue.isActive(root, '任务3'))
  assert.equal((await queue.load(root)).filter(run => run.status === 'done').length, 4)
}))

test('排队任务使用创建时的规则快照', () => withRoot(async root => {
  const { ArticleQueue } = await import('../src/main/features/content/article-queue')
  let rule = '原规则', release: (() => void) | undefined
  const used: string[] = []
  const queue = new ArticleQueue({ changed: () => {}, completed: () => {}, images: async () => [], snapshot: async () => ({ platformPrompts: { 小红书: rule }, titlePrompts: {} }), generate: async (dir, request, _progress, existing, snapshot) => {
    used.push(snapshot?.platformPrompts.小红书 ?? '')
    if (request.title === '第一篇') await new Promise<void>(resolve => { release = resolve })
    return generateDrafts(dir, request, async () => '正文', undefined, undefined, existing)
  } }, 1)
  const options = (title: string) => ({ request: { title, audience: '', platforms: ['小红书' as const], research: 'skip' as const }, imageStyle: 'flat' as const, generateImages: false, folderId: null })
  await queue.start(root, options('第一篇'))
  for (let i = 0; i < 200 && !release; i++) await new Promise(resolve => setTimeout(resolve, 5))
  await queue.start(root, options('第二篇'))
  rule = '新规则'
  release!()
  for (let i = 0; i < 200 && queue.isActive(root, '第二篇'); i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.deepEqual(used, ['原规则', '原规则'])
  assert.equal((await queue.load(root)).find(run => run.id === '第二篇')?.promptSnapshot?.platformPrompts.小红书, '原规则')
}))

test('后台文章生成保留用户的外部修改并显示失败', () => withRoot(async root => {
  const { ArticleQueue } = await import('../src/main/features/content/article-queue')
  let release: (() => void) | undefined
  const queue = new ArticleQueue({ changed: () => {}, completed: () => {}, images: async () => [], generate: async (dir, request, _progress, existing) => { await new Promise<void>(resolve => { release = resolve }); return generateDrafts(dir, request, async () => '# 模型内容', undefined, undefined, existing) } })
  const draft = await queue.start(root, { request: { title: '冲突文章', audience: '', platforms: ['公众号'], research: 'skip' }, imageStyle: 'flat', generateImages: false, folderId: null })
  for (let i = 0; i < 200 && !release; i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok(release)
  await writeFile(join(root, draft.id, '公众号', '发布文案.md'), '用户修改')
  release()
  for (let i = 0; i < 200 && queue.isActive(root, draft.id); i++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal((await readDraft(root, draft.id, '公众号')).content, '用户修改')
  assert.equal((await queue.load(root))[0].status, 'failed')
}))

test('文章任务中断后显示重试，联网失败可跳过联网继续', () => withRoot(async root => {
  const { ArticleQueue } = await import('../src/main/features/content/article-queue')
  const { ResearchUnavailableError } = await import('../src/main/errors')
  let attempts = 0
  const instructions: (string | undefined)[] = []
  const deps: ConstructorParameters<typeof ArticleQueue>[0] = {
    changed: () => {}, completed: () => {}, images: async () => [],
    generate: async (dir, request, _progress, existing) => { instructions.push(request.instruction); attempts++; if (request.research === 'online') throw new ResearchUnavailableError(); return generateDrafts(dir, request, async () => '# 已完成', undefined, undefined, existing) }
  }
  const queue = new ArticleQueue(deps)
  const draft = await queue.start(root, { request: { title: '联网失败', audience: '', instruction: '本次使用问答', platforms: ['公众号'], research: 'online' }, imageStyle: 'flat', generateImages: false, folderId: null })
  const wait = async (instance: InstanceType<typeof ArticleQueue>) => { for (let i = 0; i < 200 && instance.isActive(root, draft.id); i++) await new Promise(resolve => setTimeout(resolve, 5)) }
  await wait(queue)
  assert.equal((await queue.load(root))[0].status, 'waiting')
  const reopened = new ArticleQueue(deps)
  assert.equal((await reopened.load(root))[0].status, 'interrupted')
  await reopened.retry(root, draft.id, false); await wait(reopened)
  assert.equal((await reopened.load(root))[0].status, 'waiting')
  await reopened.retry(root, draft.id, true); await wait(reopened)
  assert.equal((await reopened.load(root))[0].status, 'done')
  assert.equal((await readDraft(root, draft.id, '公众号')).content, '# 已完成\n')
  assert.equal(attempts, 3)
  assert.deepEqual(instructions, ['本次使用问答', '本次使用问答', '本次使用问答'])
}))

test('外观跟随系统，显式浅色或深色不受系统外观变化影响', async () => {
  const { resolveAppearance } = await import('../src/renderer/src/features/appearance')
  const { isAppearanceMode } = await import('../src/shared/settings')
  assert.equal(resolveAppearance('system', false), 'light')
  assert.equal(resolveAppearance('system', true), 'dark')
  assert.equal(resolveAppearance('light', true), 'light')
  assert.equal(resolveAppearance('dark', false), 'dark')
  assert.equal(isAppearanceMode(['light']), false)
})

test('内置主题以已有主色字段保存，大小写兼容并保留旧自定义色', async () => {
  const { defaultAccentColor, themePresetForColor, themePresets } = await import('../src/shared/settings')
  assert.equal(themePresetForColor(defaultAccentColor)?.id, 'iris')
  assert.equal(new Set(themePresets.map(theme => theme.color)).size, themePresets.length)
  for (const preset of themePresets) assert.equal(themePresetForColor(preset.color.toUpperCase()), preset)
  assert.equal(themePresetForColor('#653bed'), undefined)
  assert.equal(themePresetForColor(''), undefined)
})


test('文章搜索计划依据完整需求制定，计划失败使用基本搜索并提示', () => withRoot(async root => {
  const { generateContent } = await import('../src/main/features/content/content-service')
  const config = { draftsDirectory: root, apiUrl: 'https://example.com', model: 'test', apiKey: 'test' }
  for (const fallback of [false, true]) {
    let searched = ''; let plannerInput = ''; let savedPlan: string | undefined
    const result = await generateContent({ title: fallback ? '摄影' : '社保', angle: '异地转移', audience: '年轻人', instruction: '讲清流程', platforms: ['公众号'], research: 'online' }, config, () => {}, {
      research: async (query) => { searched = query; return [] },
      saveResearch: async (_root, _id, _platform, record) => { savedPlan = record.searchPlan },
      createModel: () => async (system, user) => {
        if (system.includes('资料搜索策划')) { plannerInput = user; return fallback ? '无效' : JSON.stringify({ plan: '搜索适用条件和入口' }) }
        if (system.includes('共同策划')) return JSON.stringify({ commonFacts: '', pending: [], platforms: { 公众号: '计划' } })
        if (system.includes('检查各平台')) return JSON.stringify({ 公众号: '' })
        return JSON.stringify({ title: '平台标题', content: '文案' })
      }
    })
    assert.match(plannerInput, /异地转移/); assert.match(plannerInput, /年轻人/); assert.match(plannerInput, /讲清流程/)
    assert.match(searched, /异地转移/); assert.match(searched, /年轻人/)
    if (fallback) { assert.equal(savedPlan, undefined); assert.ok(result.warnings?.some(w => w.includes('搜索计划生成失败'))) }
    else { assert.match(searched, /搜索适用条件和入口/); assert.equal(savedPlan, '搜索适用条件和入口') }
  }
}))

test('平台来源按各自文章保存，旧记录兼容且平台重试不覆盖其他记录', () => withRoot(async root => {
  const { saveResearch, readPlatformResearch, savePlatformResearch } = await import('../src/main/features/research/research')
  const id = await createTopic(root, '来源兼容')
  const old = { version: 1 as const, status: 'sources_found' as const, checkedAt: '2026-11-20', sources: [{ title: '旧来源', url: 'https://example.com/old', retrievedAt: '2026-11-20', fetched: false }], pending: [], warnings: [] }
  await saveResearch(root, id, old)
  assert.equal((await readPlatformResearch(root, id, '公众号'))?.legacy, true)
  const a = { ...old, articleVersion: 'a', searchPlan: '原计划' }
  const b = { ...old, articleVersion: 'b', searchPlan: '新计划', sources: [{ ...old.sources[0], title: '新来源' }] }
  await savePlatformResearch(root, id, '公众号', a)
  await savePlatformResearch(root, id, '小红书', b)
  await savePlatformResearch(root, id, '小红书', { ...b, searchPlan: '重试计划' })
  assert.equal((await readPlatformResearch(root, id, '公众号'))?.searchPlan, '原计划')
  assert.equal((await readPlatformResearch(root, id, '小红书'))?.searchPlan, '重试计划')
  assert.equal((await readPlatformResearch(root, id, '抖音图文'))?.legacy, true)
}))

test('文章联网搜索使用通用来源要求，选题搜索维持原有策略', async () => {
  const { researchWithModel } = await import('../src/main/infrastructure/model-search')
  const inputs: string[] = []
  const payload = { status: 'completed', output: [ { type: 'web_search_call', status: 'completed', action: { sources: [{ url: 'https://example.com/a', title: '资料' }] } }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '整理结果' }] } ] }
  const fakeFetch: typeof fetch = async (_input, init) => { const body = JSON.parse(String(init?.body)); inputs.push(body.input); return new Response(JSON.stringify(payload), { status: 200 }) }
  const config = { apiUrl: 'https://example.com/v1', model: 'test', apiKey: 'test' }
  await researchWithModel(config, '摄影构图', fakeFetch, 'article')
  await researchWithModel(config, '社保', fakeFetch)
  assert.match(inputs[0], /摄影构图/); assert.match(inputs[0], /涉及政策时/); assert.doesNotMatch(inputs[0], /优先查找官方原始公告/)
  assert.match(inputs[1], /优先查找官方原始公告/)
})


test('平台标题单独保存，旧文章保持原文并检查并发修改', () => withRoot(async root => {
  const { createTopic, createPlatform, readPlatformTitle, savePlatformTitle, readDraft } = await import('../src/main/features/drafts/draft-store')
  const id = await createTopic(root, '旧文章')
  await createPlatform(root, id, '公众号', '# 旧标题\n\n原文')
  assert.equal(await readPlatformTitle(root, id, '公众号'), null)
  assert.equal(await savePlatformTitle(root, id, '公众号', '新标题', null), '新标题')
  await assert.rejects(savePlatformTitle(root, id, '公众号', '冲突标题', null))
  assert.equal(await readPlatformTitle(root, id, '公众号'), '新标题')
  assert.equal((await readDraft(root, id, '公众号')).content, '# 旧标题\n\n原文')
}))


test('各平台生成独立标题并按各自规则写入，正文不包含标题', () => withRoot(async root => {
  const { generateContent } = await import('../src/main/features/content/content-service')
  const { readPlatformTitle } = await import('../src/main/features/drafts/draft-store')
  const calls: string[] = []
  const config = { draftsDirectory: root, apiUrl: 'https://example.com', model: 'test', apiKey: 'test', titlePrompts: { 小红书: '简短活泼', 公众号: '严谨深入' } }
  const result = await generateContent({ title: '主题', audience: '', platforms: ['小红书', '公众号'], research: 'skip' }, config, () => {}, {
    research: async () => [], saveResearch: async () => {},
    createModel: () => async (system, user) => {
      if (system.includes('共同策划')) return JSON.stringify({ commonFacts: '', pending: [], platforms: { 小红书: '计划', 公众号: '计划' } })
      if (system.includes('检查各平台')) return JSON.stringify({ 小红书: '', 公众号: '' })
      calls.push(user)
      return JSON.stringify({ title: system.includes('小红书') ? '小红书标题' : '公众号标题', content: '正文内容' })
    }
  })
  assert.deepEqual(result.draft?.platforms, ['小红书', '公众号'])
  assert.equal(await readPlatformTitle(root, '主题', '小红书'), '小红书标题')
  assert.equal(await readPlatformTitle(root, '主题', '公众号'), '公众号标题')
  assert.equal((await readDraft(root, '主题', '公众号')).content, '正文内容\n')
  assert.match(calls[0], /简短活泼/); assert.match(calls[1], /严谨深入/)
}))

test('生成平台标题使用最新规则并返回五个候选', async () => {
  const { generateTitles } = await import('../src/main/features/content/titles')
  const input = { id: '主题', platform: '公众号' as const, version: 'v1', content: '文章正文' }
  const result = await generateTitles(input, { read: async () => ({ content: '原文', version: 'v1' }), titlePrompts: { 公众号: '标题规则：保持简短' }, platformPrompts: { 公众号: '平台规则：专业风格' }, call: async (system, user) => { assert.match(system, /标题规则：保持简短/); assert.match(system, /平台规则：专业风格/); assert.match(user, /文章正文/); return '["标题一","标题二","标题三","标题四","标题五"]' } })
  assert.equal(result.length, 5)
})
test('生成标题拒绝无效结果并检测文章变更', async () => {
  const { generateTitles } = await import('../src/main/features/content/titles')
  const input = { id: '主题', platform: '小红书' as const, version: 'v1', content: '文章正文' }
  await assert.rejects(generateTitles(input, { read: async () => ({ content: '', version: 'v1' }), call: async () => '["标题一"]' }), /5 个有效标题/)
  let count = 0
  await assert.rejects(generateTitles(input, { read: async () => ({ content: '', version: ++count === 1 ? 'v1' : 'v2' }), call: async () => '["一","二","三","四","五"]' }), /外部修改/)
})

test('按最新平台标题重新生成只替换该平台正文并保留标题', () => withRoot(async root => {
  const { generateContent } = await import('../src/main/features/content/content-service')
  const { readPlatformTitle, savePlatformTitle } = await import('../src/main/features/drafts/draft-store')
  const id = await createTopic(root, '原主题')
  await createPlatform(root, id, '公众号', '公众号原文')
  await createPlatform(root, id, '小红书', '小红书原文')
  await savePlatformTitle(root, id, '公众号', '最新标题', null)
  const version = (await readDraft(root, id, '公众号')).version
  let planned = false
  const result = await generateContent({ title: '最新标题', audience: '', platforms: ['公众号'], research: 'skip' }, { draftsDirectory: root, apiUrl: 'https://example.com', model: 'test', apiKey: 'test' }, () => {}, {
    research: async () => [], saveResearch: async () => {},
    createModel: () => async (system, user) => {
      if (system.includes('共同策划')) { assert.match(user, /最新标题/); planned = true; return JSON.stringify({ commonFacts: '', pending: [], platforms: { 公众号: '计划' } }) }
      if (system.includes('生成标题和正文')) return JSON.stringify({ title: '不采用的标题', content: '新正文' })
      return JSON.stringify({ 公众号: '' })
    }
  }, { id, versions: { 公众号: version }, expectedTitle: '最新标题' })
  assert.ok(planned); assert.ok(result.draft)
  assert.equal((await readDraft(root, id, '公众号')).content, '新正文\n')
  assert.equal(await readPlatformTitle(root, id, '公众号'), '最新标题')
  assert.equal((await readDraft(root, id, '小红书')).content, '小红书原文')
}))

test('重新生成期间正文或标题变化时保留原有内容', () => withRoot(async root => {
  const { savePlatformTitle } = await import('../src/main/features/drafts/draft-store')
  const id = await createTopic(root, '冲突测试')
  await createPlatform(root, id, '公众号', '原文')
  await savePlatformTitle(root, id, '公众号', '标题', null)
  const version = (await readDraft(root, id, '公众号')).version
  const req = { title: '标题', audience: '', platforms: ['公众号' as const], research: 'skip' as const }
  const changedTitle = await generateDrafts(root, req, async () => { await savePlatformTitle(root, id, '公众号', '新标题', '标题'); return '新正文' }, undefined, undefined, { id, versions: { 公众号: version }, expectedTitle: '标题' })
  assert.equal(changedTitle.draft, null)
  assert.equal((await readDraft(root, id, '公众号')).content, '原文')
  const changedBody = await generateDrafts(root, req, async () => { await saveDraft(root, id, '公众号', '其他修改', version); return '新正文' }, undefined, undefined, { id, versions: { 公众号: version }, expectedTitle: '新标题' })
  assert.equal(changedBody.draft, null)
  assert.equal((await readDraft(root, id, '公众号')).content, '其他修改')
}))

test('重新打开文章时，正在生成的平台保留内存内容，其他平台正常读取', async () => {
  const { prepareArticleOpen } = await import('../src/renderer/src/features/reopen-article')
  let documents = { '文章:公众号': { content: '当前正文', savedContent: '当前正文', version: 'old' }, '文章:小红书': { content: '旧内容', savedContent: '旧内容', version: 'old' } }
  const read: string[] = []
  await prepareArticleOpen('', { id: '文章', title: '文章', platforms: ['公众号', '小红书'] }, {
    getDocuments: () => documents,
    updateDocuments: fn => { documents = fn(documents) as typeof documents },
    save: async () => { throw new Error('无需保存') },
    read: async (_id, platform) => { read.push(platform); return { ok: true as const, value: { content: '重新读取', version: 'new' } } },
    isLocked: key => key === '文章:公众号'
  })
  assert.deepEqual(read, ['小红书'])
  assert.equal(documents['文章:公众号'].content, '当前正文')
  assert.equal(documents['文章:小红书'].content, '重新读取')
})

test('后台生成完成后，迟到的文章读取不会覆盖新内容', async () => {
  const { prepareArticleOpen } = await import('../src/renderer/src/features/reopen-article')
  let documents: Record<string, { content: string; savedContent: string; version: string }> = { '文章:公众号': { content: '旧内容', savedContent: '旧内容', version: 'old' } }
  await prepareArticleOpen('', { id: '文章', title: '文章', platforms: ['公众号'] }, {
    getDocuments: () => documents, updateDocuments: fn => { documents = fn(documents) },
    save: async () => { throw new Error('无需保存') },
    read: async () => { documents = { '文章:公众号': { content: '生成的新内容', savedContent: '生成的新内容', version: 'new' } }; return { ok: true as const, value: { content: '过时的读取', version: 'old' } } }
  })
  assert.equal(documents['文章:公众号'].content, '生成的新内容')
})
