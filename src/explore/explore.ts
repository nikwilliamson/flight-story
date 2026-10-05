import { Vector3 } from 'three'
import { airports, legs } from '../data'
import { latLonToVec3 } from '../geo'
import { useStory, type Shot, type TabId } from '../state/store'
import { CHAPTERS } from '../story/chapters'
import { scroll } from '../story/scrollState'
import type { ListRow } from './lists'

export const TABS: { id: TabId; label: string }[] = [
  { id: 'explore', label: 'Explore' },
  { id: 'trips', label: 'Trips' },
  { id: 'airports', label: 'Airports' },
  { id: 'planes', label: 'Aircraft' },
  { id: 'airlines', label: 'Airlines' },
  { id: 'log', label: 'Log' },
]

/** The tab a share link opens in, from its prefix. */
export function tabOf(id: string): TabId {
  const kind = id.split('-')[0]
  if (kind === 'trip') return 'trips'
  if (kind === 'airport') return 'airports'
  if (kind === 'plane' || kind === 'family') return 'planes'
  if (kind === 'airline') return 'airlines'
  if (kind === 'leg') return 'log'
  return 'explore'
}

/** The tabs' panels live at the story's end, where its last card has taken over. */
export const atEnd = () => scroll.active === CHAPTERS.length - 1

/** Whether the page is scrolled to the story's end: true from the moment of a jump, a frame before atEnd() is. */
export const scrolledToEnd = () => !!scroll.plan && window.scrollY >= (scroll.plan.segments.at(-1)?.at ?? 0) - 1

/** Where the reader was in the story when a tab took them to the end, so Story can bring them back. */
let storyY: number | null = null

/**
 * Opens a tab from anywhere: the tabs are always on (Nik), and their panels live at the story's end, so mid-story
 * the page jumps there first (the globe shows the whole log) and remembers where the reader was.
 */
export function openTab(tab: TabId) {
  if (!scrolledToEnd()) {
    storyY = window.scrollY
    window.scrollTo(0, document.documentElement.scrollHeight)
  }
  useStory.getState().setTab(tab)
  history.replaceState(null, '', `#${tab}`)
}

/** Closes the tab and returns to the story where the reader left it (or stays at the end if they came from there). */
export function backToStory() {
  useStory.getState().setTab(null)
  history.replaceState(null, '', location.pathname + location.search)
  if (storyY === null) return
  window.scrollTo(0, storyY)
  storyY = null
}

const MIN_ZOOM = 1
const MAX_ZOOM = 9
/** Share of the stage the selection's widest airport should reach from the centre. */
const FILL = 0.8

/**
 * A shot that frames a leg set: centred on the mean of its airports, zoomed so the farthest one fits (wireframe). A
 * cap of angular radius θ shows on the globe as a disc of radius sin θ, so zoom ≈ FILL / sin θ.
 */
export function shotFor(set: readonly number[]): Shot | null {
  const points: Vector3[] = []
  for (const i of set) for (const a of [legs[i].from, legs[i].to]) if (a >= 0) points.push(latLonToVec3(airports[a].lat, airports[a].lon))
  if (!points.length) return null
  const centre = points.reduce((sum, p) => sum.add(p), new Vector3())
  if (centre.lengthSq() < 1e-6) return null
  centre.normalize()
  const spread = Math.max(...points.map((p) => Math.acos(Math.min(1, p.dot(centre)))))
  const zoom = spread >= Math.PI / 2 ? MIN_ZOOM : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, FILL / Math.max(Math.sin(spread), 0.02)))
  return {
    lat: (Math.asin(centre.y) * 180) / Math.PI,
    lon: (Math.atan2(centre.x, centre.z) * 180) / Math.PI,
    zoom,
    fit: set,
  }
}

/** Frames a fly-to holds before the globe is handed back (Nik: hold ~1 s). */
export const HOLD_S = 1

/** The current fly-to, if the camera is still on its way or holding. */
export const flight = { shot: null as Shot | null, held: 0 }

/** Click on a row, chip or card: it stays lit, the camera flies to it and holds, and the link points at it. */
export function select(row: ListRow) {
  const store = useStory.getState()
  store.setSelection({ id: row.id, legs: row.legs })
  const shot = shotFor(row.legs)
  if (shot) {
    flight.shot = shot
    flight.held = 0
    store.setShot(shot)
    store.setInteractive(false)
  }
  history.replaceState(null, '', `#${row.id}`)
}

export function clearSelection() {
  useStory.getState().setSelection(null)
  history.replaceState(null, '', location.pathname + location.search)
}
