const { readFileSync, statSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { join } = require('node:path')
const yaml = require('js-yaml')
const directory = process.argv[2], version = process.argv[3]
if (!directory || !/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('Invalid update version.')
const name = `linggao-ai-${version}-win-x64.exe`
const info = yaml.load(readFileSync(join(directory, 'latest.yml'), 'utf8'))
const file = info?.files?.[0]
if (info?.version !== version || info.files?.length !== 1 || file?.url !== name || info.path !== name || info.sha512 !== file.sha512) throw new Error('Update manifest does not match the release.')
const installer = readFileSync(join(directory, name))
if (!installer.length || file.size !== statSync(join(directory, name)).size || createHash('sha512').update(installer).digest('base64') !== file.sha512) throw new Error('Installer does not match update manifest.')
console.log(`Verified ${name} and latest.yml.`)

if (process.argv.includes('--mac')) {
  const mac = yaml.load(readFileSync(join(directory, 'latest-mac.yml'), 'utf8'))
  const names = ['arm64', 'x64'].map(arch => `linggao-ai-${version}-mac-${arch}.zip`)
  if (mac?.version !== version || mac.files?.length !== names.length || !names.every(name => mac.files.some(file => file.url === name))) throw new Error('Mac update manifest does not match the release.')
  for (const file of mac.files) {
    const bytes = readFileSync(join(directory, file.url))
    if (!bytes.length || file.size !== bytes.length || createHash('sha512').update(bytes).digest('base64') !== file.sha512) throw new Error('Mac installer does not match update manifest.')
  }
  if (mac.path !== mac.files[0].url || mac.sha512 !== mac.files[0].sha512) throw new Error('Mac update manifest path is invalid.')
  console.log('Verified Mac update manifest and installers.')
}
