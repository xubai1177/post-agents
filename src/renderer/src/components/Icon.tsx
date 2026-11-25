import {
  ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, Clock, Download, ExternalLink, FileText, Folder, FolderOpen, Home, Image, LayoutGrid,
  Lightbulb, LoaderCircle, Pencil, Plus, RefreshCw, Search, Settings, Sparkles, Trash2, X,
} from 'lucide-react'

const icons = {
  back: ArrowLeft, arrow: ArrowRight, check: Check, chevron: ChevronRight, down: ChevronDown,
  clock: Clock, close: X, download: Download, external: ExternalLink, file: FileText, folder: Folder, folderOpen: FolderOpen, home: Home, image: Image, grid: LayoutGrid,
  bulb: Lightbulb, loading: LoaderCircle, edit: Pencil, plus: Plus, refresh: RefreshCw, search: Search, settings: Settings, spark: Sparkles, trash: Trash2,
}

export function Icon({ name, size = 18, className }: { name: keyof typeof icons; size?: number; className?: string }) {
  const Component = icons[name]
  return <Component aria-hidden="true" className={className} size={size} strokeWidth={1.7}/>
}
