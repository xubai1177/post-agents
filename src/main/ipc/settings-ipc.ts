import { platforms } from '../../shared/drafts'
import { ImageSizeRequestError, requestImage } from '../infrastructure/image-provider'
import { coverSizeForStyle } from '../features/images/cover-size'
import { buildStyleTestPrompt } from '../features/images/image-prompts'
import { BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import { stat } from 'node:fs/promises'
import { getCustomImageApiKey, getImageSettings, getRuntimeSettings, loadSettings, recordDirectorySelection, saveImageStylePreview, savePlatformConfig, saveSettings } from '../features/settings/settings'
import { respond } from './security'
import { fetchModelList } from '../infrastructure/model-list'

export function registerSettings(): void {
  ipcMain.handle('settings:test-image-style', (event, input: unknown) => respond(event, async () => {
    if (!input || typeof input !== 'object' || !('platform' in input) || typeof input.platform !== 'string' || !platforms.some(p => p === input.platform) || !('prompt' in input) || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 4000) throw new Error('图片风格测试：参数无效。')
    const config = await getImageSettings()
    if (!config.apiUrl || !config.apiKey || !config.model) throw new Error('图片风格测试：请先配置图片模型及服务。')
    let bytes: Buffer
    try { bytes = await requestImage(config, buildStyleTestPrompt(input.platform, input.prompt), coverSizeForStyle(config, input.prompt)) }
    catch (error) { if (error instanceof ImageSizeRequestError) throw new Error(`图片风格测试：${error.message}`); throw error }
    const image = nativeImage.createFromBuffer(bytes)
    if (image.isEmpty()) throw new Error('图片风格测试：图片服务返回了无效图片。')
    const preview = image.resize({ width: 360 }).toJPEG(80).toString('base64')
    if (preview.length > 399900) throw new Error('图片风格测试：生成的预览图片过大。')
    return `data:image/jpeg;base64,${preview}`
  }))
  ipcMain.handle('settings:open-platform', (event, name: unknown) => respond(event, async () => {
    if (typeof name !== 'string' || name.length > 50) throw new Error('invalid platform')
    const settings = await loadSettings(undefined)
    const link = settings.platformLinks.find(item => item.name === name)
    if (!link?.url || link.enabled === false) throw new Error('invalid platform link')
    const url = new URL(link.url)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid platform link')
    await shell.openExternal(url.href)
  }))
  ipcMain.handle('settings:list-models', (event, input: unknown) => respond(event, async () => {
    if (!input || typeof input !== 'object' || !('apiUrl' in input) || typeof input.apiUrl !== 'string' || !('service' in input) || (input.service !== 'text' && input.service !== 'image') || !('apiKey' in input) || !input.apiKey || typeof input.apiKey !== 'object' || !('action' in input.apiKey)) throw new Error('模型列表：请求无效。')
    const key = input.apiKey
    if (key.action !== 'keep' && key.action !== 'replace' && key.action !== 'clear') throw new Error('模型列表：请求无效。')
    if (key.action === 'replace' && (!('value' in key) || typeof key.value !== 'string')) throw new Error('模型列表：请求无效。')
    const apiKey = key.action === 'replace' && 'value' in key && typeof key.value === 'string' ? key.value : key.action === 'keep' ? (input.service === 'image' ? await getCustomImageApiKey() : (await getRuntimeSettings()).apiKey) : ''
    return fetchModelList(input.apiUrl, apiKey)
  }))
  ipcMain.handle('settings:load', (event, legacy: unknown) => respond(event, () => loadSettings(legacy)))
  ipcMain.handle('settings:choose-directory', (event) => respond(event, async () => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('missing window')
    const result = await dialog.showOpenDialog(window, { title: '选择本地草稿目录', properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const selected = result.filePaths[0]
    if (!(await stat(selected)).isDirectory()) throw new Error('not a directory')
    recordDirectorySelection(event.sender.id, selected)
    return selected
  }))
  ipcMain.handle('settings:save-image-style-preview', (event, input: unknown) => respond(event, () => saveImageStylePreview(input)))
  ipcMain.handle('settings:save-platform-config', (event, config: unknown) => respond(event, () => savePlatformConfig(config)))
  ipcMain.handle('settings:save', (event, update: unknown) => respond(event, () => saveSettings(event.sender.id, update)))
}
