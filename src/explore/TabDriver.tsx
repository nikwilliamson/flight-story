import { useEffect } from 'react'
import { legs } from '../data'
import { settledOn } from '../scene/camera/StoryCamera'
import { useStory } from '../state/store'
import { planReady } from '../story/scrollState'
import { shareIdOf } from '../hash'
import { atEnd, clearSelection, flight, HOLD_S, select, TABS, tabOf } from './explore'
import { ROWS, type ListRow } from './lists'

const NONE: readonly number[] = []

/** #leg-1385 opens the log on that leg. */
function rowFor(id: string): ListRow | undefined {
  const leg = /^leg-(\d+)$/.exec(id)
  if (leg) {
    const i = Number(leg[1]) - 1
    return legs[i] ? { id, label: `Leg ${leg[1]}`, count: 1, legs: [i] } : undefined
  }
  return ROWS.get(id)
}

/**
 * Runs the tabs from the scene's frame loop: what is lit (the hovered row, else the selection), the fly-to's hold
 * before the globe is handed back, Esc, and share links (#trips, #trip-266, #airport-mco, #leg-1385, ...).
 */
export function TabDriver() {
  useEffect(() => {
    // A share link opens its tab over the journey's start once the story is laid out, and so does one pasted later.
    let live = true
    const open = (hash: string) => {
      const id = shareIdOf(hash)
      const tab = TABS.find((t) => t.id === id)?.id
      const row = rowFor(id)
      if (!tab && !row) return
      planReady.then(() => {
        if (!live) return
        useStory.getState().setTab(tab ?? tabOf(id))
        pending = row ?? null
      })
    }
    open(location.hash)
    const changed = () => open(location.hash)
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const store = useStory.getState()
      if (store.sheet) store.setSheet(null)
      else clearSelection()
    }
    window.addEventListener('hashchange', changed)
    window.addEventListener('keydown', key)
    return () => {
      live = false
      window.removeEventListener('hashchange', changed)
      window.removeEventListener('keydown', key)
    }
  }, [])

  return null
}

/** One frame of the tabs (what is lit, the fly-to's hold), run by StoryTick after the story. */
export function stepTabs(delta: number) {
  // The journey holds still under an open tab: the page doesn't scroll until Journey is back.
  const locked = useStory.getState().tab !== null ? 'hidden' : ''
  if (document.documentElement.style.overflow !== locked) document.documentElement.style.overflow = locked
  if (!atEnd()) return
  if (pending) {
    select(pending)
    pending = null
  }
  const store = useStory.getState()
  const lit = store.hover ?? store.selection?.legs ?? NONE
  if (store.highlight !== lit) store.setHighlight(lit)

  // Fly-to: hold a beat once the camera is there, then hand the globe back to the reader.
  if (!flight.shot) return
  if (store.shot !== flight.shot) {
    flight.shot = null
    return
  }
  flight.held = settledOn(flight.shot) ? flight.held + Math.min(delta, 0.1) : 0
  if (flight.held >= HOLD_S) {
    store.setInteractive(true)
    flight.shot = null
  }
}

let pending: ListRow | null = null
