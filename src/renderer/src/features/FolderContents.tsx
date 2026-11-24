import { Button } from '@/components/ui/button'
import type { Draft, Platform } from '../../../shared/drafts'
import { workspaceChildren, type WorkspaceIndex } from '../../../shared/workspace'
import { Icon } from '../components/Icon'
import { platformLogos } from './platform-logos'

export function FolderContents({ folderId, index, drafts, onOpenFolder, onOpenArticle }: {
  folderId: string
  index: WorkspaceIndex
  drafts: Draft[]
  onOpenFolder: (id: string) => void
  onOpenArticle: (draft: Draft, platform: Platform) => void
}) {
  const folder = index.folders.find(item => item.id === folderId)
  if (!folder) return <div className="empty-state" role="status">目录不存在或已删除。</div>
  const children = workspaceChildren(index, drafts, folderId)
  const folderCount = children.filter(child => child.kind === 'folder').length
  const ancestors = [folder]
  let parent = folder.parentId
  while (parent) {
    const item = index.folders.find(entry => entry.id === parent)
    if (!item) break
    ancestors.unshift(item)
    parent = item.parentId
  }
  return <section className="folder-contents">
    <nav className="folder-breadcrumb" aria-label="目录路径">
      {ancestors.map((item, position) => <span key={item.id}>{position > 0 && <Icon name="chevron" size={14}/>}
        {item.id === folderId ? <span aria-current="page">{item.name}</span> : <Button type="button" variant="link" size="xs" onClick={() => onOpenFolder(item.id)}>{item.name}</Button>}
      </span>)}
    </nav>
    <header className="folder-contents-header"><h1>{folder.name}</h1><span>{folderCount} 个文件夹 · {children.length - folderCount} 篇文章</span></header>
    {children.length === 0 ? <p className="folder-empty">此目录暂无内容。</p> :
      <div className="folder-list">
        {children.map(({ id, kind, item }) => kind === 'folder' ?
          <Button key={id} type="button" variant="ghost" className="folder-list-row" onClick={() => onOpenFolder(item.id)}><Icon name="folder" size={18}/><span>{item.name}</span><Icon name="chevron" size={15}/></Button> :
          <div className="folder-article-row" key={id}><div className="folder-article-title"><Icon name="file" size={18}/><span>{index.titles[item.id] ?? item.title}</span></div><div className="folder-article-platforms">{item.platforms.map(platform => <Button key={platform} type="button" size="sm" variant="outline" onClick={() => onOpenArticle(item, platform)}><img src={platformLogos[platform]} alt="" />{platform}</Button>)}</div></div>)}
      </div>}
  </section>
}
