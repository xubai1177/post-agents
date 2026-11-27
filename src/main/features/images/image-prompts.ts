export function buildImagePrompt(content: string, stylePrompt: string): string {
  return `${content}\n图片风格要求：${stylePrompt}`
}

export function buildStyleTestPrompt(platform: string, stylePrompt: string): string {
  return buildImagePrompt(`为${platform}制作一张封面，主题和标题为“工作更有条理”。`, stylePrompt)
}
