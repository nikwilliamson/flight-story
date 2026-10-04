import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Globe } from './scene/Globe'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="app">
      <Globe />
    </main>
  </StrictMode>,
)
