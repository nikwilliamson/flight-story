import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Globe } from './scene/Globe'
import { Sheet } from './ui/Sheet'
import { Tabs } from './ui/Tabs'
import { Fallback, SceneBoundary } from './ui/Fallback'
import './ui/cssTokens'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="app">
      <SceneBoundary>
        <Globe />
      </SceneBoundary>
    </main>
    <Fallback />
    <Tabs />
    <Sheet />
    {/* Empty: gives the page its scroll length. The story reads window.scrollY; everything visible is in the canvas. */}
    <div id="scroll-spacer" />
  </StrictMode>,
)
