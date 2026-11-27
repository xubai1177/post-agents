import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'

const releases = Object.entries(import.meta.glob('../../../../release-notes/v*.md', { eager: true, query: '?raw', import: 'default' }))
  .map(([path, content]) => ({ version: path.split('/').pop()?.replace('.md', '') ?? '', content: String(content) }))
  .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))

const guide = `## 开始使用

1. 在窗口顶部选择或新建工作区，用来保存文章、选题和任务。
2. 打开「设置」，配置文案模型的服务地址、模型名称和密钥；需要生成图片时，配置图片生成服务。
3. 在「平台」中启用需要创作的平台，也可以调整各平台的生成规则。

## 从选题到文章

在「选题」中输入内容方向、受众和目标平台，生成候选选题。查看来源并选择选题后，可以创建单篇文章或批量创作。在「任务面板」查看生成进度和结果；失败或中断的任务可按提示重试。

也可以在「文章」中新建文章，填写主题、创作角度和受众，选择平台与保存目录，或创建空白文章自行编辑。

## 编辑与配图

在文章目录中选择文章和平台，编辑并保存文案。使用文案优化时，先检查候选结果，再决定是否应用。保存文案后可选择图片风格并生成封面和正文配图；生成的图片可在文章中预览。

生成的文案、来源和图片都需要人工核查。联网检索依赖模型服务支持搜索；如果检索失败，可按提示重试或跳过。

## 管理与备份

文章和文件夹可以在内容目录中整理；删除文件夹时，其中的文章会移回根目录。通过顶部工作区菜单可以切换工作区、导出备份或导入备份。加密备份包含模型密钥，请妥善保管密码；无密码备份不包含密钥。

## 软件更新

在「设置」中查看当前版本并检查更新。安装更新前，请保存内容并完成正在进行的任务。具体安装方式和版本限制见各版本更新日志。`

export function Documentation() {
  const [selected, setSelected] = useState('guide')
  const release = releases.find(item => item.version === selected)
  return <section className="docs-page" aria-labelledby="docs-title">
    <header className="docs-header"><h1 id="docs-title">文档</h1><p>使用教程与版本更新记录</p></header>
    <div className="docs-layout"><nav className="docs-nav" aria-label="文档目录">
      <span>帮助</span><Button variant="ghost" type="button" aria-current={selected === 'guide' ? 'page' : undefined} onClick={() => setSelected('guide')}>使用教程</Button>
      <span>更新日志</span>{releases.map(item => <Button variant="ghost" type="button" key={item.version} aria-current={selected === item.version ? 'page' : undefined} onClick={() => setSelected(item.version)}>{item.version}</Button>)}
    </nav><article className="docs-article"><h2>{release ? `${release.version} 更新日志` : '使用教程'}</h2><div className="docs-markdown"><ReactMarkdown>{release?.content ?? guide}</ReactMarkdown></div></article></div>
  </section>
}
