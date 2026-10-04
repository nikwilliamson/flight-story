import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { legs } from '../data'
import { settledOn } from '../scene/camera/StoryCamera'
import { useStory } from '../state/store'
import { scroll } from '../story/scrollState'
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
    const id = location.hash.slice(1).split('&')[0].toLowerCase()
    const tab = TABS.find((t) => t.id === id)?.id
    const row = rowFor(id)
    let timer = 0
    if (tab || row) {
      // Wait for the story to be laid out, then go straight to its end, where the tabs live.
      timer = window.setInterval(() => {
        if (!scroll.plan) return
        clearInterval(timer)
        window.scrollTo(0, document.documentElement.scrollHeight)
        useStory.getState().setTab(tab ?? tabOf(id))
        pending = row ?? null
      }, 100)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const store = useStory.getState()
      if (store.sheet) store.setSheet(null)
      else clearSelection()
    }
    window.addEventListener('keydown', key)
    return () => {
      clearInterval(timer)
      window.removeEventListener('keydown', key)
    }
  }, [])

  useFrame((_, delta) => {
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
  })
  return null
}

let pending: ListRow | null = null
