// A host-installed binary must never silently end up in a different-architecture installer.
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')
module.exports = async context => {
  if (context.electronPlatformName !== 'darwin') return
  const arch = { 1: 'x86_64', 3: 'arm64' }[context.arch]
  if (!arch) throw Error('不支持该 macOS 架构的 FFmpeg 打包。')
  const binary = join(context.packager.projectDir, '.cache', 'ffmpeg', 'ffmpeg')
  const actual = execFileSync('/usr/bin/lipo', ['-archs', binary], { encoding: 'utf8' }).trim().split(/\s+/)
  if (!actual.includes(arch)) throw Error(`FFmpeg 架构不匹配：需要 ${arch}，实际 ${actual.join(', ')}。请在对应架构环境重新安装依赖。`)
}
