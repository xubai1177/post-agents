import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Toast } from 'radix-ui'
import { Icon } from './Icon'

type Message = { id: number; text: string; error: boolean }
type ShowMessage = (text: string, error?: boolean) => void

const MessageContext = createContext<ShowMessage | null>(null)

export function MessageProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<Message | null>(null)
  const showMessage = useCallback<ShowMessage>((text, error = false) => {
    setMessage({ id: Date.now(), text, error })
  }, [])

  return <MessageContext.Provider value={showMessage}>
    <Toast.Provider swipeDirection="up">
      {children}
      {message && <Toast.Root key={message.id} className="global-message" type="foreground" duration={message.error ? 10000 : 4000} onOpenChange={open => { if (!open) setMessage(null) }}>
        <Toast.Description>{message.text}</Toast.Description>
        <Toast.Close className="global-message-close" aria-label="关闭提示"><Icon name="close" size={14}/></Toast.Close>
      </Toast.Root>}
      <Toast.Viewport className="global-message-viewport" label="消息通知"/>
    </Toast.Provider>
  </MessageContext.Provider>
}

export function useMessage(): ShowMessage {
  const showMessage = useContext(MessageContext)
  if (!showMessage) throw new Error('MessageProvider is missing')
  return showMessage
}
