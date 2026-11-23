import type { OpenDocument } from './types'

/** Return null when navigation is cancelled, otherwise preserve or restore the saved content. */
export function discardUnsavedDocument(document: OpenDocument, confirmDiscard: () => boolean): OpenDocument | null {
  if (document.content === document.savedContent) return document
  if (!confirmDiscard()) return null
  return { ...document, content: document.savedContent }
}
