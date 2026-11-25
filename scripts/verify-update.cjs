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
