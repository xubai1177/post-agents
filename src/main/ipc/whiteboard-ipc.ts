import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { listCanvasProjects, loadCanvasProject, saveCanvasProject } from '../features/whiteboard/canvas-project'
import { canvasVoiceStatuses, generateCanvasVoice, previewCanvasVoice } from '../features/whiteboard/canvas-voice'
import { saveCanvasVideo } from '../features/whiteboard/canvas-export'
import { decodeCanvasAsset, generateCanvasAsset } from '../features/whiteboard/canvas-assets'
import { listLocalBackgrounds, readLocalBackground } from '../features/whiteboard/local-backgrounds'
import { isSafeCanvasVideo } from '../features/whiteboard/canvas-validation'
import { closeCanvasWindow, isCanvasWindow, openCanvasWindow, canvasWorkspace } from '../features/whiteboard/canvas-window'
import { getDraftsDirectory, loadSettings } from '../features/settings/settings'
import { createProject, generatePlan, listProjects, projectDirectory, updatePlan, generateSticker, generateMissingStickers, replaceSticker, stickerData, renderProject, cancelRender, videoFile, deleteVideo, previewScene } from '../features/whiteboard/project'
import { respond } from './security'
import { validateStoryboard } from '../features/whiteboard/storyboard'
import { listVoiceConfigs, saveVoiceConfig, deleteVoiceConfig } from '../features/whiteboard/voice-config'
import { previewCloudVoice } from '../features/whiteboard/voice-preview'
import { openVideoWindow, isVideoWindow, videoWorkspace, setVideoWindowState } from '../features/whiteboard/video-window'
import { listDrafts, readDraft } from '../features/drafts/draft-store'
import { platforms, type Platform } from '../../shared/drafts'

export function registerWhiteboard(): void {
  const safe = <T>(event: Electron.IpcMainInvokeEvent, work: () => Promise<T>) => respond(event, async () => {
    if (process.platform !== 'darwin') throw new Error('白板视频：当前仅支持 macOS。')
    return work()
  })
  const root = (event: Electron.IpcMainInvokeEvent) => isVideoWindow(event.sender) ? Promise.resolve(videoWorkspace(event.sender)) : getDraftsDirectory()
  ipcMain.handle('whiteboard:video-open', event => safe(event, async () => openVideoWindow(await getDraftsDirectory())))
  ipcMain.handle('whiteboard:video-appearance', event => safe(event, async () => { const workspaceName = basename(videoWorkspace(event.sender)); const { appearance, accentColor, panelOpacity } = await loadSettings(undefined); return { appearance, accentColor, panelOpacity, workspaceName } }))
  ipcMain.on('whiteboard:video-state', (event, busy: unknown, dirty: unknown) => { if (event.senderFrame === event.sender.mainFrame) setVideoWindowState(event.sender, busy, dirty) })
  ipcMain.handle('whiteboard:articles', event => safe(event, async () => listDrafts(videoWorkspace(event.sender))))
  ipcMain.handle('whiteboard:article-read', (event, id: unknown, platform: unknown) => safe(event, async () => {
    if (typeof id !== 'string' || typeof platform !== 'string' || !platforms.some(item => item === platform)) throw new Error('白板视频：文章无效。')
    return readDraft(videoWorkspace(event.sender), id, platform as Platform)
  }))
  ipcMain.handle('whiteboard:voice-config-list', event => safe(event, listVoiceConfigs))
  ipcMain.handle('whiteboard:voice-config-save', (event, input: unknown) => safe(event, () => { if (isVideoWindow(event.sender) || isCanvasWindow(event.sender)) throw new Error('白板视频：请在主窗口设置语音服务。'); return saveVoiceConfig(input) }))
  ipcMain.handle('whiteboard:voice-config-delete', (event, id: unknown) => safe(event, () => { if (isVideoWindow(event.sender) || isCanvasWindow(event.sender)) throw new Error('白板视频：请在主窗口设置语音服务。'); return deleteVoiceConfig(id) }))
  ipcMain.handle('whiteboard:voice-preview', (event, configId: unknown, speaker: unknown, text: unknown, speed: unknown) => safe(event, () => previewCloudVoice(configId, speaker, text, speed)))
  ipcMain.handle('whiteboard:canvas-open', event => safe(event, async () => { if (isCanvasWindow(event.sender)) throw new Error('白板视频：画布已打开。'); await openCanvasWindow(await getDraftsDirectory()) }))
  ipcMain.handle('whiteboard:canvas-voice-configs', event => safe(event, async () => { if (!isCanvasWindow(event.sender)) throw new Error('白板视频：窗口无效。'); return listVoiceConfigs() }))
  ipcMain.handle('whiteboard:canvas-voice-sample', (event, configId: unknown, speaker: unknown, text: unknown, speed: unknown) => safe(event, () => { if (!isCanvasWindow(event.sender)) throw new Error('白板视频：窗口无效。'); return previewCloudVoice(configId, speaker, text, speed) }))
  ipcMain.handle('whiteboard:canvas-voice-status', (event, id: unknown, data: unknown) => safe(event, () => { if (typeof id !== 'string') throw new Error('白板视频：工程编号无效。'); return canvasVoiceStatuses(canvasWorkspace(event.sender), id, data) }))
  ipcMain.handle('whiteboard:canvas-voice-generate', (event, id: unknown, revision: unknown, panelId: unknown) => safe(event, () => { if (typeof id !== 'string' || typeof revision !== 'string' || typeof panelId !== 'string') throw new Error('白板视频：工程编号无效。'); return generateCanvasVoice(canvasWorkspace(event.sender), id, revision, panelId) }))
  ipcMain.handle('whiteboard:canvas-voice-audio', (event, id: unknown, data: unknown, panelId: unknown) => safe(event, () => { if (typeof id !== 'string' || typeof panelId !== 'string') throw new Error('白板视频：工程编号无效。'); return previewCanvasVoice(canvasWorkspace(event.sender), id, data, panelId) }))
  ipcMain.handle('whiteboard:canvas-project-list', event => safe(event, () => listCanvasProjects(canvasWorkspace(event.sender))))
  ipcMain.handle('whiteboard:canvas-project-load', (event, id: unknown) => safe(event, () => { if (typeof id !== 'string') throw new Error('白板视频：工程编号无效。'); return loadCanvasProject(canvasWorkspace(event.sender), id) }))
  ipcMain.handle('whiteboard:canvas-project-save', (event, id: unknown, revision: unknown, data: unknown) => safe(event, () => { if (!(id === null || typeof id === 'string') || !(revision === null || typeof revision === 'string')) throw new Error('白板视频：工程编号无效。'); return saveCanvasProject(canvasWorkspace(event.sender), id, revision, data) }))
  ipcMain.handle('whiteboard:canvas-close', event => safe(event, async () => { closeCanvasWindow(event.sender) }))
  ipcMain.handle('whiteboard:canvas-appearance', event => safe(event, async () => { if (!isCanvasWindow(event.sender)) throw new Error('白板视频：窗口无效。'); const { appearance, accentColor, panelOpacity } = await loadSettings(undefined); return { appearance, accentColor, panelOpacity } }))
  ipcMain.handle('whiteboard:canvas-local-backgrounds', event => safe(event, async () => { if (!isCanvasWindow(event.sender)) throw new Error('白板视频：窗口无效。'); return listLocalBackgrounds() }))
  ipcMain.handle('whiteboard:canvas-local-background', (event, group: unknown, filename: unknown) => safe(event, async () => { if (!isCanvasWindow(event.sender)) throw new Error('白板视频：窗口无效。'); return readLocalBackground(group, filename) }))
  ipcMain.handle('whiteboard:canvas-import', event => safe(event, async () => {
    if (!isCanvasWindow(event.sender)) throw new Error('白板视频：窗口无效。')
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('白板视频：窗口不可用。')
    const result = await dialog.showOpenDialog(window, { title: '选择图片素材', properties: ['openFile'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    const file = result.filePaths[0], info = await stat(file)
    if (!info.isFile() || info.size > 15 * 1024 * 1024) throw new Error('白板视频：图片无效或超过 15 MB。')
    const { basename } = await import('node:path')
    return decodeCanvasAsset(await readFile(file), basename(file))
  }))
  ipcMain.handle('whiteboard:canvas-generate', (event, description: unknown, purpose: unknown, ratio: unknown) => safe(event, async () => {
    if (!isCanvasWindow(event.sender)) throw new Error('白板视频：窗口无效。')
    if (typeof description !== 'string') throw new Error('白板视频：素材描述无效。')
    if (purpose !== undefined && purpose !== 'sticker' && purpose !== 'background') throw new Error('白板视频：素材类型无效。')
    if (ratio !== undefined && ratio !== 'landscape' && ratio !== 'vertical') throw new Error('白板视频：画布比例无效。')
    return generateCanvasAsset(description, purpose, ratio)
  }))
  ipcMain.handle('whiteboard:canvas-save-video', (event, data: unknown) => safe(event, async () => {
    if (!isCanvasWindow(event.sender)) throw new Error('白板视频：窗口无效。')
    if (!isSafeCanvasVideo(data)) throw new Error('白板视频：视频数据无效或超过 200 MB。')
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('白板视频：窗口不可用。')
    const result = await dialog.showSaveDialog(window, { title: '保存无声动画', defaultPath: '白板动画.webm', filters: [{ name: 'WebM 视频', extensions: ['webm'] }], properties: ['showOverwriteConfirmation'] })
    if (result.canceled || !result.filePath) return null
    try { await saveCanvasVideo(result.filePath, data) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('白板视频：文件已存在，请选择其他名称。'); throw new Error('白板视频：保存视频失败，请检查目录权限。') }
    return result.filePath
  }))
  ipcMain.handle('whiteboard:list', event => safe(event, async () => listProjects(await root(event))))
  ipcMain.handle('whiteboard:create', (event, topic: unknown) => safe(event, async () => {
    if (typeof topic !== 'string') throw new Error('白板视频：主题无效。')
    return createProject(await root(event), topic)
  }))
  ipcMain.handle('whiteboard:plan', (event, id: unknown) => safe(event, async () => {
    if (typeof id !== 'string') throw new Error('白板视频：工程编号无效。')
    return generatePlan(await root(event), id)
  }))
  ipcMain.handle('whiteboard:save-plan', (event, id: unknown, plan: unknown) => safe(event, async () => {
    if (typeof id !== 'string') throw new Error('白板视频：工程编号无效。')
    let valid
    try { valid = validateStoryboard(plan) } catch (error) { throw new Error(`白板视频：${error instanceof Error ? error.message : '分镜内容无效。'}`) }
    try { return await updatePlan(await root(event), id, valid) } catch { throw new Error('白板视频：无法保存分镜，请检查工作区后重试。') }
  }))
  ipcMain.handle('whiteboard:generate-missing-stickers', (event, id: unknown) => safe(event, async () => {
    if (typeof id !== 'string') throw new Error('白板视频：工程编号无效。')
    return generateMissingStickers(await root(event), id)
  }))
  ipcMain.handle('whiteboard:generate-sticker', (event, id: unknown, scene: unknown, beat: unknown) => safe(event, async () => {
    if (typeof id !== 'string' || typeof scene !== 'number' || typeof beat !== 'number') throw new Error('白板视频：场景无效。')
    return generateSticker(await root(event), id, scene, beat)
  }))
  ipcMain.handle('whiteboard:sticker', (event, id: unknown, scene: unknown, beat: unknown) => safe(event, async () => {
    if (typeof id !== 'string' || typeof scene !== 'number' || typeof beat !== 'number') throw new Error('白板视频：场景无效。')
    return stickerData(await root(event), id, scene, beat)
  }))
  ipcMain.handle('whiteboard:replace-sticker', (event, id: unknown, scene: unknown, beat: unknown) => safe(event, async () => {
    if (typeof id !== 'string' || typeof scene !== 'number' || typeof beat !== 'number') throw new Error('白板视频：场景无效。')
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('白板视频：窗口不可用。')
    const result = await dialog.showOpenDialog(window, { title: '选择贴纸图片', properties: ['openFile'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0], info = await stat(path)
    if (!info.isFile() || info.size > 15 * 1024 * 1024) throw new Error('白板视频：图片无效或超过 15 MB。')
    return replaceSticker(await root(event), id, scene, beat, await readFile(path))
  }))
  ipcMain.handle('whiteboard:preview-scene', (event, id: unknown, scene: unknown, plan: unknown) => safe(event, async () => {
    if (typeof id !== 'string' || typeof scene !== 'number') throw new Error('白板视频：场景无效。')
    let draft
    try { draft = plan === undefined ? undefined : validateStoryboard(plan) } catch (error) { throw new Error(`白板视频：${error instanceof Error ? error.message : '分镜内容无效。'}`) }
    return previewScene(await root(event), id, scene, draft)
  }))
  ipcMain.handle('whiteboard:render', (event, id: unknown, options: unknown) => safe(event, async () => {
    if (typeof id !== 'string' || !options || typeof options !== 'object') throw new Error('白板视频：工程编号或语音设置无效。')
    return renderProject(await root(event), id, options, phase => { if (!event.sender.isDestroyed()) event.sender.send('whiteboard:render-phase', phase) })
  }))
  ipcMain.handle('whiteboard:cancel', (event, id: unknown) => safe(event, async () => {
    if (typeof id !== 'string') throw new Error('白板视频：工程编号无效。')
    cancelRender(id)
  }))
  ipcMain.handle('whiteboard:preview', (event, id: unknown, videoId: unknown) => safe(event, async () => {
    if (typeof id !== 'string' || (videoId !== undefined && typeof videoId !== 'string')) throw new Error('白板视频：工程编号无效。')
    const error = await shell.openPath(await videoFile(await root(event), id, videoId))
    if (error) throw new Error('白板视频：无法打开视频。')
  }))
  ipcMain.handle('whiteboard:video-delete', (event, id: unknown, videoId: unknown) => safe(event, async () => {
    if (typeof id !== 'string' || typeof videoId !== 'string') throw new Error('白板视频：视频记录无效。')
    return deleteVideo(await root(event), id, videoId, path => shell.trashItem(path))
  }))
  ipcMain.handle('whiteboard:video-reveal', (event, id: unknown, videoId: unknown) => safe(event, async () => {
    if (typeof id !== 'string' || typeof videoId !== 'string') throw new Error('白板视频：视频记录无效。')
    shell.showItemInFolder(await videoFile(await root(event), id, videoId))
  }))
  ipcMain.handle('whiteboard:reveal', (event, id: unknown) => safe(event, async () => {
    if (typeof id !== 'string') throw new Error('白板视频：工程编号无效。')
    const error = await shell.openPath(await projectDirectory(await root(event), id))
    if (error) throw new Error('白板视频：无法打开工程目录。')
  }))
}
