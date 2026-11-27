import type { ElementRef, StoryboardRelation, StoryboardScene } from './whiteboard'

/** Remove references to a deleted element, then shift later elements in the same beat. */
export function relationsAfterElementRemoval(relations: StoryboardRelation[] | undefined, beat: number, element: number): StoryboardRelation[] | undefined {
  if (!relations) return undefined
  const deleted = (ref: ElementRef): boolean => ref.beat === beat && ref.element === element
  const shift = (ref: ElementRef): ElementRef => ref.beat === beat && ref.element > element ? { ...ref, element: ref.element - 1 } : ref
  return relations.filter(relation => !deleted(relation.from) && !deleted(relation.to)).map(relation => ({ ...relation, from: shift(relation.from), to: shift(relation.to) }))
}
export function relationsAfterLastBeatRemoval(scene: StoryboardScene): StoryboardRelation[] | undefined {
  return scene.relations?.filter(relation => relation.from.beat < scene.beats.length - 1 && relation.to.beat < scene.beats.length - 1)
}
