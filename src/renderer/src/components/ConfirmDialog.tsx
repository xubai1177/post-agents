import { useEffect, useRef, useState } from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type Confirmation = { title: string; message: string; action: string }

export function useConfirmDialog() {
  const [request, setRequest] = useState<Confirmation | null>(null)
  const [open, setOpen] = useState(false)
  const resolver = useRef<((accepted: boolean) => void) | null>(null)
  const origin = useRef<HTMLElement | null>(null)

  useEffect(() => () => resolver.current?.(false), [])

  function confirm(confirmation: Confirmation): Promise<boolean> {
    if (resolver.current) return Promise.resolve(false)
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setRequest(confirmation)
    setOpen(true)
    return new Promise(resolve => { resolver.current = resolve })
  }

  function finish(accepted: boolean) {
    const resolve = resolver.current
    resolver.current = null
    setOpen(false)
    resolve?.(accepted)
  }

  return {
    confirm,
    confirmation: request && <AlertDialog open={open} onOpenChange={next => { if (!next) finish(false) }}>
      <AlertDialogContent className="gap-3 p-4" onCloseAutoFocus={event => {
        event.preventDefault()
        origin.current?.focus()
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{request.title}</AlertDialogTitle>
          <AlertDialogDescription>{request.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => finish(true)}>{request.action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>,
  }
}
