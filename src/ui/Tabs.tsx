import type { CSSProperties } from 'react'
import { backToStory, openTab, TABS } from '../explore/explore'
import { useStory } from '../state/store'
import { bodyWidth } from './interactive'
import { layoutFor, TAB_HEIGHT, tabBarTop, useViewport } from './layout'
import { RAIL_REACH } from './Rail'

const SIZE = 13
const SPACING = 6
/** The year readout's widest line, so centred tabs never run under it. */
const HUD_WIDTH = 230

/** The bar's tabs: Journey (the story) first (lit while no tab is open), then the explore tabs. */
const BAR: { id: (typeof TABS)[number]['id'] | null; label: string }[] = [{ id: null, label: 'Journey' }, ...TABS]

/**
 * The tabs, always on (Nik) and centred on the page: Journey, Explore, Trips, Airports, Aircraft, Airlines, Log.
 * HTML rather than the scene now that they're permanent chrome: crisp at any DPR, real buttons, and there before the
 * globe has loaded. Desktop: across the top. Phone: along the bottom of the pinned globe.
 */
export function Tabs() {
  const tab = useStory((s) => s.tab)
  const ready = useStory((s) => s.ready)
  const { width, height } = useViewport()
  const layout = layoutFor(width, height)
  const s = layout.scale
  // Shrink to fit the row: text, padding and gaps scale together. Desktop stays clear of the readout and the rail.
  const room = width - (layout.phone ? 16 : 2 * (RAIL_REACH + HUD_WIDTH))
  const natural = BAR.reduce((sum, t) => sum + bodyWidth(t.label, SIZE * s) + 2 * SIZE * s, 0) + SPACING * s * (BAR.length - 1)
  const k = s * Math.min(1, room / natural)
  const style = { top: tabBarTop(layout), '--tab-h': `${TAB_HEIGHT * s}px`, '--tab-k': k } as CSSProperties

  // Not over the loading cover: the bar slides in as it lifts.
  if (!ready) return null
  return (
    <nav className="tabs" style={style} aria-label="Views">
      {BAR.map((t) => {
        const active = tab === t.id
        return (
          <button
            key={t.label}
            className={active ? 'tab on' : 'tab'}
            aria-current={active ? 'page' : undefined}
            // Journey, or the open tab again, closes it, back to the journey where the reader left it.
            onClick={() => (t.id === null || active ? backToStory() : openTab(t.id))}
          >
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
