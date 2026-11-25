const { readFileSync, writeFileSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { join } = require('node:path')
const yaml = require('js-yaml')
const directory = process.argv[2], version = process.argv[3]
if (!directory || !/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('Invalid update version.')
const files = ['arm64', 'x64'].map(arch => {
  const url = `linggao-ai-${version}-mac-${arch}.zip`
  const data = readFileSync(join(directory, url))
  if (!data.length) throw new Error(`Empty installer: ${url}`)
  return { url, sha512: createHash('sha512').update(data).digest('base64'), size: data.length }
})
writeFileSync(join(directory, 'latest-mac.yml'), yaml.dump({ version, files, path: files[0].url, sha512: files[0].sha512, releaseDate: new Date().toISOString() }, { noRefs: true }))
