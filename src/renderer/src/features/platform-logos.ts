import type { Platform } from '../../../shared/drafts'
import xiaohongshuLogo from '../assets/xiaohongshu.svg'
import wechatLogo from '../assets/wechat.svg'
import douyinLogo from '../assets/tiktok.svg'

export const platformLogos: Record<Platform, string> = {
  '小红书': xiaohongshuLogo,
  '公众号': wechatLogo,
  '抖音图文': douyinLogo,
}
