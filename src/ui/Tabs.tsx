import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { backToStory, openTab, TABS } from '../explore/explore'
import { opensTab } from '../explore/TabDriver'
import { useStory } from '../state/store'
import { layoutFor, tabBarTop, useViewport } from './layout'

/** The bar's tabs: Journey (the story) first (lit while no tab is open), then the explore tabs. */
const BAR: { id: (typeof TABS)[number]['id'] | null; label: string }[] = [{ id: null, label: 'Journey' }, ...TABS]

/**
 * The tabs, always on (Nik): Journey, Explore, Trips, Airports, Aircraft, Airlines, Log. HTML rather than the scene
 * now that they're permanent chrome: crisp at any DPR, real buttons. Desktop: across the top, aligned with the card
 * column they drive. Phone: along the bottom of the pinned globe, full size, in a row that scrolls sideways.
 */
export function Tabs() {
  const tab = useStory((s) => s.tab)
  const ready = useStory((s) => s.ready)
  const { width, height } = useViewport()
  const layout = layoutFor(width, height)
  const bar = useRef<HTMLElement>(null)
  // Someone arriving on a share link lands in a tab and may never find the story behind it: Journey invites them in
  // until they've been there once.
  const [invite, setInvite] = useState(() => opensTab(location.hash))
  const seen = useRef(tab)
  useEffect(() => {
    // Cleared on the way back from a tab, not before the share link has opened one.
    if (seen.current !== null && tab === null) setInvite(false)
    seen.current = tab
  }, [tab])
  // Keep the open tab in view on phones, where the row scrolls.
  useEffect(() => {
    bar.current?.querySelector<HTMLElement>('.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [tab])

  // Not over the loading cover: the bar slides in as it lifts.
  if (!ready) return null
  const style = { top: tabBarTop(layout), '--tabs-left': `${layout.phone ? 16 : layout.card.x}px` } as CSSProperties
  return (
    <nav ref={bar} className={layout.phone ? 'tabs phone' : 'tabs'} style={style} aria-label="Views">
      {BAR.map((t) => {
        const active = tab === t.id
        const inviting = invite && t.id === null
        return (
          <button
            key={t.label}
            className={active ? 'pill on' : inviting ? 'pill invite' : 'pill'}
            aria-current={active ? 'page' : undefined}
            // Journey, or the open tab again, closes it, back to the journey where the reader left it.
            onClick={() => (t.id === null || active ? backToStory() : openTab(t.id))}
          >
            {inviting ? 'Start the journey' : t.label}
          </button>
        )
      })}
    </nav>
  )
}
