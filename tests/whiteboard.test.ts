import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { parseStoryboard, validateStoryboard } from '../src/main/features/whiteboard/storyboard'
import { captionTimeline, subtitlesSrt } from '../src/main/features/whiteboard/timeline'

const beat = { narration: '第一句。', sticker: '一只手绘蓝色小鸟', elements: [{ type: 'text', text: '重点' }, { type: 'arrow', text: '指向' }] }
const scene = { focus: '画面重点', layout: 'list', beats: [beat, beat] }
const plan = { title: '示例标题', scenes: [scene, scene, scene] }
test('分镜只接受受限结构，并兼容旧场景', () => {
  const result = parseStoryboard(JSON.stringify({ ...plan, script: 'do not execute' }))
  assert.deepEqual(result, plan)
  assert.throws(() => validateStoryboard({ ...plan, scenes: [scene] }))
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...scene, layout: 'script' }, scene, scene] }))
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...scene, beats: [{ ...beat, elements: [{ type: 'javascript', text: 'x' }] }] }, scene, scene] }))
  assert.throws(() => parseStoryboard('{bad json'))
  const legacy = { focus: '旧场景', narration: '旧旁白。', sticker: '旧贴纸', elements: [{ type: 'text', text: '旧重点' }] }
  const migrated = validateStoryboard({ title: '旧工程', scenes: [legacy, legacy, legacy] })
  assert.equal(migrated.scenes[0].beats[0].sticker, '旧贴纸')
  assert.deepEqual(validateStoryboard(migrated), migrated)
})
test('画面锚点必须指向实际旁白分句并保持旧分镜兼容', () => {
  const anchored = { ...beat, narration: '先休息，再运动。', stickerCue: 1, elements: [{ type: 'text', text: '行动', cue: 1 }] }
  const input = { ...plan, scenes: [{ ...scene, beats: [anchored, beat] }, scene, scene] }
  assert.deepEqual(validateStoryboard(input), input)
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...scene, beats: [{ ...anchored, stickerCue: 2 }] }, scene, scene] }), /旁白片段/)
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...scene, beats: [{ ...anchored, elements: [{ ...anchored.elements[0], cue: -1 }] }] }, scene, scene] }), /旁白片段/)
})
test('编译保留贴纸和文字的各自旁白锚点', async () => {
  const { compileScene } = await import('../src/main/features/whiteboard/scene-compiler')
  const b = { start: 0, duration: 10, cues: [0, 4, 8], stickerCue: 2, image: { dataURL: 'data:image/png;base64,AA==', width: 100, height: 100 }, elements: [{ type: 'text' as const, text: '稍后', cue: 1 }] }
  const compiled = compileScene({ focus: '标题', layout: 'list', beats: [b] })
  const image = compiled.elements.findIndex(item => item.type === 'image')
  const label = compiled.elements.findIndex(item => item.text === '稍后')
  assert.equal(compiled.cueOf?.[image], 2)
  assert.equal(compiled.cueOf?.[label], 1)
  const legacy = compileScene({ focus: '标题', layout: 'list', beats: [{ ...b, stickerCue: undefined, elements: [{ type: 'text', text: '旧内容' }] }] })
  assert.equal(legacy.cueOf, undefined)
  const withoutSticker = compileScene({ focus: '标题', layout: 'list', beats: [{ ...b, image: undefined, stickerCue: undefined }] })
  assert.equal(withoutSticker.elements.some(item => item.type === 'image'), false)
  const noStickerBeat = { ...beat, sticker: '' }
  assert.equal(validateStoryboard({ ...plan, scenes: [{ ...scene, beats: [noStickerBeat] }, scene, scene] }).scenes[0].beats[0].sticker, '')
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...scene, beats: [{ ...noStickerBeat, stickerCue: 0 }] }, scene, scene] }), /未使用贴纸/)
})
test('分镜保留受限颜色和位置，兼容自动布局并拒绝越界', () => {
  const placed = { ...beat, elements: [{ type: 'box', text: '重点', color: 'green', x: 10, y: 20, width: 35, height: 12 }] }
  const withPlacement = { ...plan, scenes: [{ ...scene, beats: [placed, beat] }, scene, scene] }
  assert.deepEqual(validateStoryboard(withPlacement), withPlacement)
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...scene, beats: [{ ...placed, elements: [{ ...placed.elements[0], x: 90 }] }] }, scene, scene] }), /位置或尺寸/)
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...scene, beats: [{ ...placed, elements: [{ ...placed.elements[0], color: 'url(javascript:bad)' }] }] }, scene, scene] }), /颜色/)
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...scene, beats: [{ ...placed, elements: [{ type: 'text', text: '重点', x: 10 }] }] }, scene, scene] }), /位置或尺寸/)
})
test('关系图校验节点引用，并在删除元素或节拍时保持连线指向正确', async () => {
  const { relationsAfterElementRemoval, relationsAfterLastBeatRemoval } = await import('../src/shared/whiteboard-relations')
  const links = [
    { from: { beat: 0, element: 0 }, to: { beat: 0, element: 1 }, label: '影响', style: 'dashed' as const },
    { from: { beat: 0, element: 1 }, to: { beat: 1, element: 0 } }
  ]
  const graph = { ...scene, layout: 'diagram', relations: links }
  assert.deepEqual(validateStoryboard({ ...plan, scenes: [graph, scene, scene] }).scenes[0], graph)
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...graph, relations: [...links, links[0]] }, scene, scene] }), /重复/)
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...graph, relations: [{ from: { beat: 0, element: 9 }, to: { beat: 1, element: 0 } }] }, scene, scene] }), /不存在/)
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...graph, relations: [{ from: { beat: 0, element: 0 }, to: { beat: 0, element: 0 } }] }, scene, scene] }), /自身/)
  const overlapBeat = { ...beat, elements: [{ type: 'box', text: '甲', x: 5, y: 5, width: 30, height: 20 }, { type: 'box', text: '乙', x: 20, y: 10, width: 30, height: 20 }] }
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...graph, beats: [overlapBeat], relations: [links[0]] }, scene, scene] }), /重叠/)
  const crowdedBeat = { ...beat, elements: Array.from({ length: 7 }, () => ({ type: 'text', text: '节点' })) }
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...graph, beats: [crowdedBeat, crowdedBeat], relations: [] }, scene, scene] }), /12/)

  assert.deepEqual(relationsAfterElementRemoval(links, 0, 0), [{ from: { beat: 0, element: 0 }, to: { beat: 1, element: 0 } }])
  assert.deepEqual(relationsAfterLastBeatRemoval(graph), [links[0]])
})
test('句级字幕按真实音频时长连续排列', () => {
  const timeline = captionTimeline([{ text: '你好。', durationMs: 1325 }, { text: '世界。', durationMs: 2080 }])
  assert.deepEqual(timeline[1], { text: '世界。', startMs: 1325, endMs: 3405 })
  assert.match(subtitlesSrt(timeline), /00:00:01,325 --> 00:00:03,405\n世界。/)
  assert.throws(() => captionTimeline([{ text: '无声', durationMs: 0 }]))
  assert.throws(() => captionTimeline([{ text: '无效\n时间', durationMs: 10 }]))
})

test('图片响应只传递服务商返回的用量，原有接口仍返回图片', async () => {
  const { requestImage, requestImageWithUsage } = await import('../src/main/infrastructure/image-provider')
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('png').toString('base64') }], usage: { input_tokens: 12, output_tokens: 3 } }), { status: 200 })
    const config = { apiUrl: 'https://example.com/v1', model: 'image', apiKey: 'test' }
    const result = await requestImageWithUsage(config, 'example')
    assert.deepEqual(result.bytes, Buffer.from('png'))
    assert.deepEqual(result.usage, { input_tokens: 12, output_tokens: 3 })
    assert.deepEqual(await requestImage(config, 'example'), Buffer.from('png'))
    globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('png').toString('base64') }] }), { status: 200 })
    assert.equal((await requestImageWithUsage(config, 'example')).usage, null)
  } finally { globalThis.fetch = original }
})

test('旁白分句保留标点并限制字幕长度', async () => {
  const { splitNarration } = await import('../src/main/features/whiteboard/timeline')
  assert.deepEqual(splitNarration('你好，世界！'), ['你好，', '世界！'])
  assert.equal(splitNarration('字'.repeat(25)).length, 2)
})

test('贴纸抠图仅移除与纯白边缘相连的背景，保留封闭的白色细节', async () => {
  const { removeWhiteBorder } = await import('../src/main/features/whiteboard/sticker-background')
  const width = 9, height = 9, pixels = Buffer.alloc(width * height * 4, 255)
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) if (x === 2 || x === 6 || y === 2 || y === 6) { const i = (y * width + x) * 4; pixels[i] = pixels[i + 1] = pixels[i + 2] = 0 }
  const output = removeWhiteBorder(pixels, width, height)
  assert.ok(output)
  assert.equal(output[3], 0)
  assert.equal(output[(4 * width + 4) * 4 + 3], 255)
  const colored = Buffer.alloc(width * height * 4, 80)
  assert.equal(removeWhiteBorder(colored, width, height), null)
})

test('模型用量汇总保留未提供字段，不把未知数当作零', async () => {
  const { formatUsageSummary, summarizeUsage } = await import('../src/shared/whiteboard-usage')
  assert.equal(formatUsageSummary([]), '暂无调用')
  assert.equal(formatUsageSummary([null]), '未提供')
  assert.equal(formatUsageSummary([3, null, 7]), '已知 10，1 次未提供')
  assert.equal(formatUsageSummary([0, 2]), '2')
  assert.deepEqual(summarizeUsage([NaN, -1, 5]), { known: 5, missing: 2, calls: 3 })
})

test('同心区域限定节拍和元素数量并保留旧分镜', () => {
  const region = { ...scene, layout: 'concentric' }
  assert.deepEqual(validateStoryboard({ ...plan, scenes: [region, scene, scene] }).scenes[0], region)
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...region, beats: [beat] }, scene, scene] }), /同心区域/)
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...region, beats: [{ ...beat, elements: [...beat.elements, ...beat.elements] }, beat] }, scene, scene] }), /同心区域/)
})

test('旧分镜编译为受限 SVG 元素并保留节拍和贴纸', async () => {
  const { compileScene } = await import('../src/main/features/whiteboard/scene-compiler')
  const image = { dataURL: 'data:image/png;base64,AA==', width: 100, height: 200 }
  const compiled = compileScene({ focus: '舒适区', layout: 'concentric', beats: [
    { elements: [{ type: 'circle', text: '舒适区', color: 'blue' }], image, start: 0, duration: 5 },
    { elements: [{ type: 'circle', text: '拉伸区', color: 'green' }], image, start: 5, duration: 6 }
  ] })
  assert.deepEqual(compiled.beats, [[0, 5], [5, 11]])
  assert.equal(compiled.elements.filter(element => element.type === 'ellipse').length, 2)
  assert.deepEqual(compiled.beatOf.slice(0, 2), [1, 0])
  assert.equal(compiled.elements.filter(element => element.type === 'image').length, 2)
  for (const element of compiled.elements) {
    assert.ok(element.x >= 0 && element.y >= 0 && element.x + element.width <= 1920 && element.y + element.height <= 960)
    assert.ok(['ellipse', 'rectangle', 'text', 'image', 'line', 'arrow'].includes(element.type))
  }
  assert.equal(compiled.files.image0.dataURL, image.dataURL)
})

test('SVG 关系编译绕过中间节点并保留箭头和标记', async () => {
  const { compileScene } = await import('../src/main/features/whiteboard/scene-compiler')
  const image = { dataURL: 'data:image/png;base64,AA==', width: 100, height: 100 }
  const node = (text: string, x: number) => ({ type: 'box' as const, text, x, y: 40, width: 15, height: 10 })
  const result = compileScene({ focus: '关系', layout: 'diagram', beats: [{ elements: [node('甲', 5), node('中间', 40), node('乙', 75)], image, start: 0, duration: 10 }], relations: [{ from: { beat: 0, element: 0 }, to: { beat: 0, element: 2 }, label: '影响', style: 'dashed' }] })
  const arrow = result.elements.find(item => item.type === 'arrow')
  assert.equal(arrow?.strokeStyle, 'dashed')
  assert.equal(arrow?.points?.length, 4)
  assert.ok(result.elements.some(item => item.text === '影响'))
})

test('画布素材仅接收常见图片签名，未知用量不当作零', async () => {
  const { isSafeCanvasImage, isSafeCanvasVideo, canvasImageUsage } = await import('../src/main/features/whiteboard/canvas-validation')
  assert.equal(isSafeCanvasImage(Buffer.from('<svg onload="alert(1)"/>')), false)
  assert.equal(isSafeCanvasImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true)
  assert.equal(isSafeCanvasImage(Buffer.from([255, 216, 255, 0])), true)
  assert.equal(isSafeCanvasImage(Buffer.from('RIFFxxxxWEBP')), true)
  assert.equal(isSafeCanvasVideo(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), true)
  assert.equal(isSafeCanvasVideo(Buffer.from('not video')), false)
  assert.deepEqual(canvasImageUsage({ input_tokens: 10, total_tokens: 15 }), { inputTokens: 10, outputTokens: null, totalTokens: 15, images: null })
  assert.deepEqual(canvasImageUsage(null), { inputTokens: null, outputTokens: null, totalTokens: null, images: null })
})

test('画布视频导出不覆盖同名文件并清理临时文件', async () => {
  const { mkdtemp, readFile, readdir, rm, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { saveCanvasVideo } = await import('../src/main/features/whiteboard/canvas-export')
  const dir = await mkdtemp(join(tmpdir(), 'whiteboard-export-test-'))
  try {
    const file = join(dir, '动画.webm'), original = Buffer.from('已有视频'), video = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1])
    await writeFile(file, original)
    await assert.rejects(saveCanvasVideo(file, video), { code: 'EEXIST' })
    assert.deepEqual(await readFile(file), original)
    assert.deepEqual(await readdir(dir), ['动画.webm'])
    const next = join(dir, '新动画.webm'); await saveCanvasVideo(next, video)
    assert.deepEqual(await readFile(next), video)
    assert.deepEqual((await readdir(dir)).sort(), ['动画.webm', '新动画.webm'].sort())
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('强调仅允许受限文字样式，旧分镜仍保持原样', async () => {
  const marked = { ...beat, elements: [{ type: 'text', text: '先行动', emphasis: 'underline' }] }
  const input = { ...plan, scenes: [{ ...scene, beats: [marked, beat] }, scene, scene] }
  assert.deepEqual(validateStoryboard(input), input)
  for (const element of [{ type: 'text', text: '错误', emphasis: 'script' }, { type: 'box', text: '错误', emphasis: 'circle' }]) {
    assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...scene, beats: [{ ...beat, elements: [element] }] }, scene, scene] }), /强调/)
  }
  const { compileScene } = await import('../src/main/features/whiteboard/scene-compiler')
  const image = { dataURL: 'data:image/png;base64,AA==', width: 100, height: 100 }
  const centered = compileScene({ focus: '区域', layout: 'concentric', beats: [
    { elements: [{ type: 'text', text: '舒适区', emphasis: 'underline' }], image, start: 0, duration: 5 },
    { elements: [{ type: 'text', text: '拉伸区' }], image, start: 5, duration: 5 }
  ] })
  assert.ok(centered.elements.some(item => item.type === 'line'), '同心区域的中心文字也应显示强调')
  for (const [emphasis, kind] of [['highlight', 'rectangle'], ['circle', 'ellipse'], ['underline', 'line']] as const) {
    const result = compileScene({ focus: '结论', layout: 'list', beats: [{ elements: [{ type: 'text', text: '先行动', emphasis }], image, start: 0, duration: 8 }] })
    assert.ok(result.elements.some(item => item.type === kind))
    assert.ok(result.elements.every(item => item.x >= 0 && item.y >= 0 && item.x + item.width <= 1920 && item.y + item.height <= 960))
  }
})

test('通栏结论支持节拍式排版并拒绝过多内容', async () => {
  const section = { ...scene, layout: 'spotlight' }
  assert.equal(validateStoryboard({ ...plan, scenes: [section, scene, scene] }).scenes[0].layout, 'spotlight')
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...section, beats: [beat, beat, beat, beat] }, scene, scene] }), /重点结论/)
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...section, beats: [{ ...beat, elements: [...beat.elements, beat.elements[0]] }] }, scene, scene] }), /重点结论/)
  const { compileScene } = await import('../src/main/features/whiteboard/scene-compiler')
  const image = { dataURL: 'data:image/png;base64,AA==', width: 400, height: 600 }
  for (const count of [1, 2, 3]) {
    const result = compileScene({ focus: '重点', layout: 'spotlight', beats: Array.from({ length: count }, (_, i) => ({ elements: [{ type: 'text' as const, text: '重要结论'.repeat(5) }, { type: 'text' as const, text: '说明' }], image, start: i * 5, duration: 5 })) })
    const labels = result.elements.filter(el => el.type === 'text').slice(1), images = result.elements.filter(el => el.type === 'image')
    assert.ok(labels.every(el => el.textAlign === 'center'))
    assert.ok(labels.every(el => el.y + el.height <= Math.min(...images.map(image => image.y))))
    assert.ok(result.elements.every(el => el.x >= 0 && el.y >= 0 && el.x + el.width <= 1920 && el.y + el.height <= 960))
  }
})

test('自动图文和分栏布局按节拍对齐并保持字幕安全区', async () => {
  const { compileScene } = await import('../src/main/features/whiteboard/scene-compiler')
  const image = { dataURL: 'data:image/png;base64,AA==', width: 400, height: 400 }
  for (const layout of ['list', 'columns', 'steps'] as const) for (const count of [1, 2, 3, 4]) {
    const result = compileScene({ focus: '重点', layout, beats: Array.from({ length: count }, (_, i) => ({ elements: [{ type: 'text' as const, text: '内容' }], image, start: i * 5, duration: 5 })) })
    assert.ok(result.elements.every(el => el.x >= 0 && el.y >= 0 && el.x + el.width <= 1920 && el.y + el.height <= 960))
    if (layout !== 'list') assert.ok(result.elements.filter(el => el.type === 'text').slice(1).every(el => el.textAlign === 'center'))
  }
})

test('贴纸自定义位置经过边界校验并按比例进入画布', async () => {
  const placed = { ...beat, stickerPosition: { x: 50, y: 10, width: 30, height: 40 } }
  const input = { ...plan, scenes: [{ ...scene, beats: [placed, beat] }, scene, scene] }
  assert.deepEqual(validateStoryboard(input), input)
  assert.throws(() => validateStoryboard({ ...plan, scenes: [{ ...scene, beats: [{ ...placed, stickerPosition: { x: 90, y: 0, width: 30, height: 30 } }] }, scene, scene] }), /贴纸位置/)
  const { compileScene } = await import('../src/main/features/whiteboard/scene-compiler')
  const image = { dataURL: 'data:image/png;base64,AA==', width: 100, height: 100 }
  const result = compileScene({ focus: '重点', layout: 'list', beats: [{ ...placed, elements: [{ type: 'text', text: '文字' }], image, start: 0, duration: 5 }] })
  const sticker = result.elements.find(el => el.type === 'image')
  assert.ok(sticker && sticker.x >= 960 && sticker.x + sticker.width <= 1476 && sticker.y >= 261 && sticker.y + sticker.height <= 548)
})

test('独立画布使用受信任页面的路由片段，不放宽页面来源', async () => {
  const { isTrustedRendererUrl } = await import('../src/main/ipc/trusted-url')
  const file = 'file:///app/renderer/index.html'
  assert.equal(isTrustedRendererUrl(`${file}#whiteboard-canvas`, file, false), true)
  assert.equal(isTrustedRendererUrl('file:///app/renderer/other.html#whiteboard-canvas', file, false), false)
  assert.equal(isTrustedRendererUrl('file:///app/renderer/index.html?other=1#whiteboard-canvas', file, false), false)
  assert.equal(isTrustedRendererUrl('http://127.0.0.1:5173/#whiteboard-canvas', 'http://127.0.0.1:5173/', true), true)
  assert.equal(isTrustedRendererUrl('http://127.0.0.1:5174/#whiteboard-canvas', 'http://127.0.0.1:5173/', true), false)
})

test('布局避让固定贴纸和文字，保留自定义坐标并报告不可解决的固定碰撞', async () => {
  const { solveLayout } = await import('../src/main/features/whiteboard/layout-solver')
  const fixed = { id: '固定贴纸', box: { x: 400, y: 300, w: 300, h: 260 }, fixed: true, kind: 'image' as const }
  const auto = { id: '自动文字', box: { x: 440, y: 340, w: 350, h: 75 }, fixed: false, kind: 'text' as const }
  const result = solveLayout([auto, fixed])
  assert.deepEqual(result.boxes[fixed.id], fixed.box)
  const a = result.boxes[auto.id], b = result.boxes[fixed.id]
  assert.ok(a.x+a.w <= b.x || b.x+b.w <= a.x || a.y+a.h <= b.y || b.y+b.h <= a.y)
  assert.deepEqual(result.issues, [])
  assert.deepEqual(solveLayout([auto, fixed]), result, '布局应与运行次数无关')
  const locked = { ...auto, id: '固定文字', fixed: true }
  assert.deepEqual(solveLayout([fixed, locked]).issues, [{ first: '固定文字', second: '固定贴纸' }])
})

test('场景自动布局避开自定义贴纸并保持所有画面元素可见', async () => {
  const { compileScene } = await import('../src/main/features/whiteboard/scene-compiler')
  const image = { dataURL: 'data:image/png;base64,AA==', width: 300, height: 200 }
  const result = compileScene({ focus: '排版', layout: 'list', beats: [
    { image, stickerPosition: { x: 10, y: 30, width: 40, height: 40 }, elements: [{ type: 'text', text: '重要内容' }], start: 0, duration: 5 },
    { image, elements: [{ type: 'text', text: '后续内容' }], start: 5, duration: 5 }
  ] })
  assert.equal(result.layoutIssues.length, 0)
  const picture = result.elements.find(el => el.type === 'image')!, label = result.elements.find(el => el.text === '重要内容')!
  assert.ok(picture.x+picture.width <= label.x || label.x+label.width <= picture.x || picture.y+picture.height <= label.y || label.y+label.height <= picture.y)
})

test('短文案与贴纸按同一视觉组收拢并保持文字对齐', async () => {
  const { compileScene } = await import('../src/main/features/whiteboard/scene-compiler')
  const image = { dataURL: 'data:image/png;base64,AA==', width: 300, height: 300 }
  const result = compileScene({ focus: '画面', layout: 'list', beats: [
    { image, elements: [{ type: 'text', text: '行动' }], start: 0, duration: 5 },
    { image, elements: [{ type: 'text', text: '从小处开始' }], start: 5, duration: 5 }
  ] })
  const labels=result.elements.filter(el=>el.type==='text').slice(1), pictures=result.elements.filter(el=>el.type==='image')
  assert.equal(labels[0].x, labels[1].x)
  assert.ok(pictures[0].x-(labels[1].x+labels[1].width) <= 150)
  assert.equal(result.layoutIssues.length, 0)
})

test('空间不足和包含区域允许的标签有明确处理', async () => {
  const { solveLayout } = await import('../src/main/features/whiteboard/layout-solver')
  const wall = { id: '固定贴纸', box: { x: 100, y: 190, w: 1720, h: 715 }, fixed: true, kind: 'image' as const }
  const label = { id: '自动文字', box: { x: 300, y: 300, w: 400, h: 80 }, fixed: false, kind: 'text' as const }
  const blocked = solveLayout([wall, label])
  assert.ok(blocked.boxes[label.id])
  assert.ok(blocked.issues.some(issue => issue.first === label.id))
  const nested = solveLayout([{ ...label, fixed: true, protectedRegion: 'region' }], [{ id: 'region', box: { x: 250, y: 250, w: 600, h: 400 } }])
  assert.deepEqual(nested.issues, [], '区域标签应允许放在其所属区域内')
})
