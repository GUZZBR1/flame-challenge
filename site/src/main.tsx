import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { warmBackend } from './lib/api'
import './index.css'

// wake the sleeping free-tier API while the visitor is still on the hero
warmBackend()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
