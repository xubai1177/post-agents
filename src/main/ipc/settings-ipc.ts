import { BrowserWindow, dialog, ipcMain } from 'electron'
import { stat } from 'node:fs/promises'
import { getCustomImageApiKey, getRuntimeSettings, loadSettings, recordDirectorySelection, saveSettings } from '../features/settings/settings'
import { respond } from './security'
import { fetchModelList } from '../infrastructure/model-list'

export function registerSettings(): void {
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
  ipcMain.handle('settings:save', (event, update: unknown) => respond(event, () => saveSettings(event.sender.id, update)))
}
