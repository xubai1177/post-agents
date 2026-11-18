import type { CreateRequest } from '../shared/drafts'
import type { ImageRequest } from '../shared/images'
import type { GenerationProgress } from '../shared/research'
import { getImageSettings, getRuntimeSettings } from './features/settings/settings'
import { generateContent } from './features/content/content-service'
import { generateImageSet } from './features/images/image-service'
import { readDraft } from './features/drafts/draft-store'
import { generateImages } from './features/images/image-generation'
import { createTextModel } from './infrastructure/text-model'
import { requestImage } from './infrastructure/image-provider'

export async function createContent(request: CreateRequest, progress: (phase: GenerationProgress) => void) {
  return generateContent(request, await getRuntimeSettings(), progress)
}

export function createImages(request: ImageRequest) {
  return generateImageSet(request, { getImageSettings, getRuntimeSettings, readDraft, createTextModel, generateImages, requestImage })
}
