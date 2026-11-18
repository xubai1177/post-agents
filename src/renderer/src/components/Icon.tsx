import type { ReactNode } from 'react'

export function Icon({ name, size = 20, className = '' }: { name: string; size?: number; className?: string }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06-1.76 3-.09-.02a1.8 1.8 0 0 0-1.9.7l-.06.08H8l-.06-.08a1.8 1.8 0 0 0-1.9-.7l-.09.02-1.76-3 .06-.06a1.8 1.8 0 0 0 .36-2l-.05-.1a1.8 1.8 0 0 0-1.55-1.1H3v-3.6h.01a1.8 1.8 0 0 0 1.55-1.1l.05-.1a1.8 1.8 0 0 0-.36-2l-.06-.06 1.76-3 .09.02a1.8 1.8 0 0 0 1.9-.7L8 3.2h8l.06.08a1.8 1.8 0 0 0 1.9.7l.09-.02 1.76 3-.06.06a1.8 1.8 0 0 0-.36 2l.05.1A1.8 1.8 0 0 0 21 10.2v3.6a1.8 1.8 0 0 0-1.56 1.1z"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>, back: <><path d="M19 12H5M10 7l-5 5 5 5"/></>,
    spark: <><path d="m12 3 1.8 5.8L20 11l-6.2 2.2L12 19l-1.8-5.8L4 11l6.2-2.2L12 3ZM19 17l.6 1.4L21 19l-1.4.6L19 21l-.6-1.4L17 19l1.4-.6L19 17Z"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m4 18 5-5 3 3 3-4 5 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>, edit: <><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>
  }
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

