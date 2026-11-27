// Build the same redistributable LGPL FFmpeg source natively on each Mac CI runner.
const { existsSync, mkdirSync, mkdtempSync, rmSync, copyFileSync, readFileSync, writeFileSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const https = require('node:https')
const { createWriteStream } = require('node:fs')
const { pipeline } = require('node:stream/promises')
const version = '7.1.5', digest = 'de668509caf9e35e3cd162473441fdb29538c6d96ed080292b3cf9e6fc5d558f'
const flags = ['--disable-everything', '--disable-autodetect', '--disable-doc', '--disable-debug', '--disable-x86asm', '--disable-ffplay', '--disable-ffprobe', '--enable-ffmpeg', '--enable-videotoolbox', '--enable-zlib', '--enable-protocol=file,pipe', '--enable-demuxer=image2pipe,wav,mov', '--enable-muxer=mp4,null', '--enable-decoder=png,pcm_s16le,h264,aac', '--enable-encoder=h264_videotoolbox,aac,wrapped_avframe,pcm_s16le', '--enable-parser=png,h264,aac', '--enable-filter=scale,format,aresample,anull,null', '--enable-swscale', '--enable-swresample']
const run = (command, args, cwd) => { const r = spawnSync(command, args, { cwd, stdio: 'inherit' }); if (r.error || r.status !== 0) throw r.error || Error(`${command} 失败`) }
async function download(url, destination) {
  const response = await new Promise((ok, fail) => https.get(url, { timeout: 30000 }, ok).on('error', fail))
  if (response.statusCode !== 200) throw Error(`FFmpeg 源码下载失败：${response.statusCode}`)
  await pipeline(response, createWriteStream(destination, { flags: 'wx' }))
}
async function main() {
  if (process.platform !== 'darwin') return
  const output = resolve('.cache', 'ffmpeg'), marker = join(output, 'build.json')
  const identity = JSON.stringify({ version, digest, arch: process.arch, flags })
  if (existsSync(marker) && readFileSync(marker, 'utf8') === identity && existsSync(join(output, 'ffmpeg')) && existsSync(join(output, 'source.tar.xz'))) return
  const temp = mkdtempSync(join(tmpdir(), 'linggao-ffmpeg-'))
  try {
    const archive = join(temp, 'source.tar.xz')
    if (process.env.LINGGAO_FFMPEG_ARCHIVE) copyFileSync(process.env.LINGGAO_FFMPEG_ARCHIVE, archive)
    else { console.log(`下载 FFmpeg ${version} 源码…`); await download(`https://ffmpeg.org/releases/ffmpeg-${version}.tar.xz`, archive) }
    if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== digest) throw Error('FFmpeg 源码校验失败。')
    run('/usr/bin/tar', ['-xf', archive, '-C', temp], temp)
    const source = join(temp, `ffmpeg-${version}`)
    run('./configure', flags, source)
    run('/usr/bin/make', ['-j4', 'ffmpeg'], source)
    mkdirSync(output, { recursive: true })
    copyFileSync(join(source, 'ffmpeg'), join(output, 'ffmpeg'))
    copyFileSync(archive, join(output, 'source.tar.xz'))
    copyFileSync(join(source, 'COPYING.LGPLv2.1'), join(output, 'COPYING.LGPLv2.1'))
    writeFileSync(join(output, 'BUILD.txt'), `FFmpeg ${version}\nSource: https://ffmpeg.org/releases/ffmpeg-${version}.tar.xz\nSHA-256: ${digest}\nConfiguration: ./configure ${flags.join(' ')}\n`)
    writeFileSync(marker, identity)
  } finally { rmSync(temp, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
