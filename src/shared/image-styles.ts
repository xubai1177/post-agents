export const imageStyles = ['flat', 'handdrawn', 'watercolor', 'minimal'] as const
export type ImageStyle = typeof imageStyles[number]
export const imageStyleLabels: Record<ImageStyle, string> = { flat: '清新扁平', handdrawn: '手绘插画', watercolor: '水彩', minimal: '极简信息图' }
export const defaultImageStyle: ImageStyle = 'flat'
export function isImageStyle(value: unknown): value is ImageStyle { return typeof value === 'string' && imageStyles.some((style) => style === value) }
