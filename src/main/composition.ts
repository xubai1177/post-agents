import type { CreateRequest, RegenerateRequest, OptimizeRequest, GenerateTitlesRequest, TestPlatformPromptRequest } from '../shared/drafts'
import type { ArticleImagesRequest, ImageRequest, ImageJob } from '../shared/images'
import type { GenerationProgress } from '../shared/research'
import { getImageSettings, getRuntimeSettings } from './features/settings/settings'
import { generateContent, testPlatformPrompt } from './features/content/content-service'
import { generateCreatedArticleImages } from './features/images/article-images'
import { generateImageSet } from './features/images/image-service'
import { readDraft, readPlatformTitle } from './features/drafts/draft-store'
import { generateImages } from './features/images/image-generation'
import { createTextModel } from './infrastructure/text-model'
import { optimizeContent } from './features/content/optimize'
import { generateTitles } from './features/content/titles'
import { requestImage } from './infrastructure/image-provider'
import { notifyGeneration } from './infrastructure/notifications'
import { ArticleQueue } from './features/content/article-queue'

export async function createContent(request: CreateRequest, progress: (phase: GenerationProgress) => void) {
  return generateContent(request, await getRuntimeSettings(), progress)
}

export async function testPlatformRules(request: TestPlatformPromptRequest) {
  const config = await getRuntimeSettings()
  if (!config.apiUrl || !config.model || !config.apiKey) throw new Error('请先在设置中配置模型地址、模型名称和密钥。')
  return testPlatformPrompt(request, createTextModel(config))
}

export function createImages(request: ImageRequest) {
  return generateImageSet(request, { getImageSettings, getRuntimeSettings, readDraft, createTextModel, generateImages, requestImage })
}

export async function optimizeArticle(request: OptimizeRequest) {
  const config = await getRuntimeSettings()
  if (!config.draftsDirectory) throw new Error('请先在设置中选择草稿目录。')
  if (!config.apiUrl || !config.model || !config.apiKey) throw new Error('请先在设置中配置模型地址、模型名称和密钥。')
  return optimizeContent(request, { read: (id, platform) => readDraft(config.draftsDirectory, id, platform), call: createTextModel(config), platformPrompts: config.platformPrompts })
}

export async function regenerateArticle(request: RegenerateRequest, progress: (phase: GenerationProgress) => void) {
  const config = await getRuntimeSettings()
  const root = config.draftsDirectory
  if (!root) throw new Error('请先在设置中选择草稿目录。')
  if (articleQueue.isActive(root, request.id)) throw new Error('文章操作：文章正在生成，请稍候。')
  if ((await readDraft(root, request.id, request.platform)).version !== request.version || await readPlatformTitle(root, request.id, request.platform) !== request.storedTitle) throw new Error('文章操作：文章或标题已变化，请重新打开后重试。')
  const previous = (await articleQueue.load(root)).find(run => run.id === request.id)?.request
  const generation: CreateRequest = { title: request.title, audience: previous?.audience ?? '', angle: previous?.angle, research: previous?.research ?? 'skip', platforms: [request.platform] }
  const result = await generateContent(generation, config, progress, undefined, { id: request.id, versions: { [request.platform]: request.version }, expectedTitle: request.storedTitle })
  if (!result.draft) throw new Error(`文章操作：${result.failures[0]?.error ?? '重新生成失败，请重试。'}`)
  return { document: await readDraft(root, request.id, request.platform), warnings: result.warnings ?? [] }
}

export async function createTitles(request: GenerateTitlesRequest) {
  const config = await getRuntimeSettings()
  if (!config.draftsDirectory) throw new Error('请先在设置中选择草稿目录。')
  if (!config.apiUrl || !config.model || !config.apiKey) throw new Error('请先在设置中配置模型地址、模型名称和密钥。')
  return generateTitles(request, { read: (id, platform) => readDraft(config.draftsDirectory, id, platform), call: createTextModel(config), titlePrompts: config.titlePrompts })
}

export async function createArticleImages(request: ArticleImagesRequest, onProgress: (message: string) => void): Promise<string[]> {
  const textConfig = await getRuntimeSettings()
  const imageConfig = await getImageSettings()
  const root = textConfig.draftsDirectory
  if (!root || imageConfig.draftsDirectory !== root) throw new Error('请先确认当前工作空间。')
  return generateCreatedArticleImages({ id: request.id, platforms: request.platforms }, request.style, {
    onProgress, imageStylesByPlatform: request.imageStylesByPlatform,
    onComplete: (count, partial) => notifyGeneration({ kind: 'images', count, partial }),
    read: async (id, platform) => { try { return { ok: true as const, value: await readDraft(root, id, platform) } } catch { return { ok: false as const, error: '无法读取文章，请检查工作空间。' } } },
    generate: async (imageRequest, progress) => { try { return { ok: true as const, value: await generateImageSet(imageRequest, { getImageSettings: async () => imageConfig, getRuntimeSettings: async () => textConfig, readDraft, createTextModel, generateImages, requestImage }, progress) } } catch { return { ok: false as const, error: '无法生成配图，请检查图片和文案模型服务。' } } }
  })
}

import { TopicQueue } from './features/topics/topic-queue'
import { readTopicWorkspace, updateTopicWorkspace } from './features/topics/topic-store'
import { researchTopic } from './features/research/research'
import { generateTopics } from './features/topics/topic-service'
const topicListeners = new Set<(root: string) => void>()
export function onTopicQueueChanged(listener: (root: string) => void): () => void { topicListeners.add(listener); return () => topicListeners.delete(listener) }
export const topicQueue = new TopicQueue({
  read: readTopicWorkspace,
  update: updateTopicWorkspace,
  changed: (root) => { for (const listener of topicListeners) listener(root) },
  completed: (count, partial) => notifyGeneration({ kind: 'topics', count, partial }),
  generate: async (request, skip, id, progress) => {
    const config = await getRuntimeSettings()
    if (!config.apiUrl || !config.model || !config.apiKey) throw new Error('模型服务未配置。')
    return generateTopics(request, skip, id, progress, { research: (topic, callback) => researchTopic(config, topic, callback), call: createTextModel(config) })
  }
})

const articleListeners = new Set<(root: string) => void>()
export function onArticleQueueChanged(listener: (root: string) => void): () => void { articleListeners.add(listener); return () => articleListeners.delete(listener) }
export const articleQueue = new ArticleQueue({
  changed: (root) => { for (const listener of articleListeners) listener(root) },
  completed: (result) => notifyGeneration({ kind: 'article', count: result.draft?.platforms.length ?? 0, partial: result.failures.length > 0 || Boolean(result.warnings?.length) }),
  snapshot: async () => { const settings = await getRuntimeSettings(); return { platformPrompts: settings.platformPrompts, titlePrompts: settings.titlePrompts } },
  generate: async (root, request, progress, existing, snapshot) => generateContent(request, { ...await getRuntimeSettings(), ...snapshot, draftsDirectory: root }, progress, undefined, existing),
  images: async (root, draft, run, onProgress) => {
    const textConfig = await getRuntimeSettings(), imageConfig = await getImageSettings()
    return generateCreatedArticleImages(draft, run.imageStyle, {
      onProgress, imageStylesByPlatform: run.imageStylesByPlatform,
      onComplete: (count, partial) => notifyGeneration({ kind: 'images', count, partial }),
      read: async (id, platform) => { try { return { ok: true as const, value: await readDraft(root, id, platform) } } catch { return { ok: false as const, error: '无法读取文章，请检查工作空间。' } } },
      generate: async (request, progress) => { try { return { ok: true as const, value: await generateImageSet(request, { getImageSettings: async () => ({ ...imageConfig, draftsDirectory: root }), getRuntimeSettings: async () => ({ ...textConfig, draftsDirectory: root }), readDraft, createTextModel, generateImages, requestImage }, progress) } } catch { return { ok: false as const, error: '无法生成配图，请检查图片和文案模型服务。' } } }
    })
  }
})


const imageJobs = new Map<string, { root: string; job: ImageJob; request: ImageRequest; run: () => ReturnType<typeof generateImageSet> }>()
const imagePending: string[] = []
const imageListeners = new Set<() => void>()
let activeImageJobs = 0
const imageKey = (root: string, request: Pick<ImageRequest, 'id' | 'platform'>) => JSON.stringify([root, request.id, request.platform])
export function onImageJobsChanged(listener: () => void): void { imageListeners.add(listener) }
function imageChanged(): void { for (const listener of imageListeners) listener() }
export function listImageJobs(root: string): ImageJob[] { return [...imageJobs.values()].filter(item => item.root === root).map(item => ({ ...item.job })) }
export async function enqueueImageJob(request: ImageRequest): Promise<void> {
  const textConfig = await getRuntimeSettings(), imageConfig = await getImageSettings()
  const root = textConfig.draftsDirectory
  if (!root || imageConfig.draftsDirectory !== root) throw new Error('请先在设置中选择草稿目录。')
  if (!imageConfig.apiUrl || !imageConfig.apiKey || !imageConfig.model) throw new Error('请先配置图片模型及图片服务。')
  if (!textConfig.apiUrl || !textConfig.model || !textConfig.apiKey) throw new Error('请先配置文案模型，用于策划配图。')
  const key = imageKey(root, request), previous = imageJobs.get(key)
  if (previous && (previous.job.status === 'queued' || previous.job.status === 'running')) throw new Error('正在为此平台生成图片，请稍候。')
  const document = await readDraft(root, request.id, request.platform)
  if (document.version !== request.version) throw new Error('文案已发生变化，请重新读取并保存后再生成。')
  // Recheck after asynchronous validation so simultaneous submissions cannot enqueue duplicates.
  const current = imageJobs.get(key)
  if (current && (current.job.status === 'queued' || current.job.status === 'running')) throw new Error('正在为此平台生成图片，请稍候。')
  imageJobs.set(key, { root, request, job: { id: request.id, platform: request.platform, status: 'queued' }, run: () => generateImageSet(request, { getImageSettings: async () => imageConfig, getRuntimeSettings: async () => textConfig, readDraft, createTextModel, generateImages, requestImage }, progress => { const item = imageJobs.get(key); if (item) { item.job.progress = progress; imageChanged() } }) })
  imagePending.push(key); imageChanged(); pumpImageJobs()
}
function pumpImageJobs(): void {
  while (activeImageJobs < 3 && imagePending.length) {
    const key = imagePending.shift()!, item = imageJobs.get(key)!
    activeImageJobs++; item.job.status = 'running'; imageChanged()
    void item.run().then(result => {
      const failed = result.failures.map(failure => `第 ${failure.index} 张：${failure.error}`).join('；')
      item.job.status = result.images.length ? 'done' : 'failed'
      item.job.message = failed ? `已保存 ${result.images.length} 张；${failed}` : `已保存 ${result.images.length} 张图片，请逐张检查文字、事实和画面。`
      notifyGeneration({ kind: 'images', count: result.images.length, partial: result.failures.length > 0 })
    }).catch((error: unknown) => {
      item.job.status = 'failed'
      const knownErrors = ['文案已发生变化，请重新读取并保存后再生成。', '配图方案生成失败：文案模型请求失败，请检查文案模型服务。', '配图方案生成失败：文案模型返回的配图方案格式或数量不符合要求，请重试。', '正在为此平台生成图片，请稍候。']
      item.job.message = error instanceof Error && knownErrors.includes(error.message) ? error.message : '生成配图失败，请检查图片服务和文章后重试。'
    }).finally(() => { activeImageJobs--; imageChanged(); pumpImageJobs() })
  }
}
