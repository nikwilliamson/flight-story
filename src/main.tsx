import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Globe } from './scene/Globe'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="app">
      <Globe />
    </main>
    {/* Empty: gives the page its scroll length. The story reads window.scrollY; everything visible is in the canvas. */}
    <div id="scroll-spacer" />
  </StrictMode>,
)
