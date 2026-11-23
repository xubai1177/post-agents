import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { MessageProvider } from './components/MessageProvider'
import './styles.css'
import './studio.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MessageProvider><App /></MessageProvider>
  </StrictMode>
)
