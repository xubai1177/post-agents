import { BrowserWindow, dialog, ipcMain } from 'electron'
import { stat } from 'node:fs/promises'
import { loadSettings, recordDirectorySelection, saveSettings } from '../features/settings/settings'
import { respond } from './security'

export function registerSettings(): void {
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
