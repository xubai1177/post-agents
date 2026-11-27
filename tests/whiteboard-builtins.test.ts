import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { builtinAssets, materialShapes } from '../src/renderer/src/features/whiteboard-builtin'
import { drawBuiltin, findBuiltin } from '../src/renderer/src/features/whiteboard-builtin-draw'

test('用途分类中的新素材具有唯一标识，并能被描线渲染器找到', () => {
  const all = [...builtinAssets, ...materialShapes]
  assert.equal(new Set(all.map(asset => asset.id)).size, all.length)
  assert.deepEqual(new Set(materialShapes.map(asset => asset.category)), new Set(['形状', '容器', '箭头', '边框', '圈勾叉']))
  for (const asset of materialShapes) {
    assert.equal(findBuiltin(asset.id), asset)
    assert.ok(asset.paths.length > 0 && asset.paths.every(path => path.d.startsWith('M')))
  }
})

test('内置 SVG 与目录一致，只包含本地受限图形', () => {
  assert.equal(builtinAssets.length, 39)
  assert.equal(new Set(builtinAssets.map(asset => asset.id)).size, builtinAssets.length)
  for (const asset of builtinAssets) {
    assert.match(asset.id, /^[a-z0-9-]+$/)
    assert.ok(asset.name && asset.category && asset.paths.length)
    const svg = readFileSync(join(process.cwd(), 'src/renderer/public/whiteboard/builtin', `${asset.id}.svg`), 'utf8')
    assert.match(svg, /viewBox="0 0 128 128"/)
    assert.doesNotMatch(svg, /<(?:script|foreignObject|image|use|style)\b|\b(?:href|onload|onclick)\s*=|url\s*\(/i)
    const paths = [...svg.matchAll(/<path d="([^"]+)" fill="([^"]+)"/g)]
    assert.deepEqual(paths.map(match => ({ d: match[1], fill: match[2] })), asset.paths.map(path => ({ d: path.d, fill: path.fill })))
    assert.equal((svg.match(/stroke="none"/g) ?? []).length, asset.paths.filter(path => path.stroke === false).length)
  }
})

test('内置素材分开描绘不相连路径，完成时再显示填色', () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const originalPath = Object.getOwnPropertyDescriptor(globalThis, 'Path2D')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElementNS: () => ({ setAttribute() {}, getTotalLength: () => 10, getPointAtLength: (n: number) => ({ x: n, y: 0 }) }) } })
  Object.defineProperty(globalThis, 'Path2D', { configurable: true, value: class { constructor(_d: string) {} } })
  let strokes = 0, fills = 0
  const ctx = { globalAlpha: 1, save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokes++ }, fill() { fills++ } } as unknown as CanvasRenderingContext2D
  try {
    const asset = { id: 'test-separated-paths', name: '测试', category: '测试', paths: [{ d: 'M0 0 L1 1 M2 2 L3 3', fill: '#ffffff' }] }
    drawBuiltin(ctx, asset, .3)
    assert.equal(strokes, 1)
    assert.equal(fills, 0)
    strokes = 0
    drawBuiltin(ctx, asset, 1)
    assert.equal(strokes, 2)
    assert.equal(fills, 1)
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document')
    if (originalPath) Object.defineProperty(globalThis, 'Path2D', originalPath); else Reflect.deleteProperty(globalThis, 'Path2D')
  }
})

test('背景铺满按横竖画布比例裁切并保留所选位置', async () => {
  const { coverRect } = await import('../src/renderer/src/features/whiteboard-background')
  assert.deepEqual(coverRect(1280, 720, 2400, 2400, 1, .5, .5), { x: 0, y: -280, width: 1280, height: 1280 })
  assert.deepEqual(coverRect(720, 1280, 2400, 2400, 1, 0, .5), { x: -0, y: 0, width: 1280, height: 1280 })
  const shifted = coverRect(1280, 720, 2400, 2400, 2, .5, 1)
  assert.equal(shifted.y + shifted.height, 720)
  assert.equal(shifted.width, 2560)
})

test('背景先绘制底色，再按铺满或平铺绘制图片', async () => {
  const { drawBackground, defaultBackground } = await import('../src/renderer/src/features/whiteboard-background')
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'DOMMatrix')
  Object.defineProperty(globalThis, 'DOMMatrix', { configurable: true, value: class { scale() { return this } } })
  const calls: string[] = []
  const ctx = { canvas: { width: 1280, height: 720 }, fillStyle: '', fillRect() { calls.push('fill') }, drawImage() { calls.push('image') }, save() {}, restore() {}, createPattern() { calls.push('pattern'); return { setTransform() {} } } } as unknown as CanvasRenderingContext2D
  const images = new Map([['sample', { complete: true, naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement]])
  try {
    drawBackground(ctx, { ...defaultBackground, image: 'sample' }, images)
    assert.deepEqual(calls, ['fill', 'image'])
    calls.length = 0
    drawBackground(ctx, { ...defaultBackground, image: 'sample', mode: 'tile' }, images)
    assert.deepEqual(calls, ['fill', 'pattern', 'fill'])
    calls.length = 0
    drawBackground(ctx, { ...defaultBackground, image: 'missing' }, images)
    assert.deepEqual(calls, ['fill'])
  } finally {
    if (previous) Object.defineProperty(globalThis, 'DOMMatrix', previous); else Reflect.deleteProperty(globalThis, 'DOMMatrix')
  }
})
