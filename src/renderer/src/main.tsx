import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CanvasWindow } from './features/CanvasWindow'
import { isCanvasWindowRoute } from './features/canvas-routes'
import { VideoWindow } from './features/VideoWindow'
import { MessageProvider } from './components/MessageProvider'
import './styles.css'
import './studio.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MessageProvider>{isCanvasWindowRoute(window.location.hash) ? <CanvasWindow /> : window.location.hash === '#whiteboard-video' ? <VideoWindow /> : <App />}</MessageProvider>
  </StrictMode>
)
