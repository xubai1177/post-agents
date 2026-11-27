const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  try {
    const api = require(process.argv[2]), root = process.argv[3]
    api.registerWhiteboard()
    await api.openCanvasWindow(root)
    const window = BrowserWindow.getAllWindows().find(item => api.isCanvasWindow(item.webContents))
    assert.ok(window, '画布窗口应已创建')
    const invoke = script => window.webContents.executeJavaScript(script, true)
    const initial = await invoke('window.canvasApi.listProjects()')
    assert.deepEqual(initial, { ok: true, value: [] })
    const data = { version: 1, name: '接口测试工程', panels: [{ id: randomUUID(), name: '画布 1', items: [], background: { color: '#ffffff', image: null, name: '', mode: 'cover', scale: 1, x: .5, y: .5 }, ratio: 'landscape' }], assets: [], activePanel: 0, pen: 'pencil' }
    const saved = await invoke(`window.canvasApi.saveProject(null, null, ${JSON.stringify(data)})`)
    assert.equal(saved.ok, true)
    const projects = await invoke('window.canvasApi.listProjects()')
    assert.equal(projects.ok, true); assert.equal(projects.value[0].name, data.name)
    const loaded = await invoke(`window.canvasApi.loadProject(${JSON.stringify(saved.value.id)})`)
    assert.equal(loaded.ok, true); assert.equal(loaded.value.id, saved.value.id)
    const status = await invoke(`window.canvasApi.voiceStatuses(${JSON.stringify(saved.value.id)}, ${JSON.stringify({ voice: { mode: 'local', configId: '', speaker: 'zh_female_vv_uranus_bigtts', speed: 1 }, panels: [{ id: data.panels[0].id, narration: '测试旁白' }] })})`)
    assert.equal(status.ok, true); assert.equal(status.value[0].state, 'missing')
    const invalid = await invoke(`window.canvasApi.generateVoice(${JSON.stringify(saved.value.id)}, 'bad-revision', ${JSON.stringify(data.panels[0].id)})`)
    assert.equal(invalid.ok, false)
    window.destroy(); console.log('画布窗口 preload、IPC 和工作区工程读写通过。'); app.exit(0)
  } catch (error) { console.error(error); app.exit(1) }
})
