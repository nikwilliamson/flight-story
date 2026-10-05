import { fmt } from '../data/facts'
import type { TabId } from '../state/store'
import { coarse } from '../scene/quality'
import { LISTS, type ListId } from './lists'

/** Touch has no hover: a tap lights and flies at once. */
const LIGHT = coarse ? 'Tap one to light it and fly there.' : 'Hover one to light it; click to fly the globe to it.'

export interface PanelSpec {
  eyebrow: string
  title: string
  intro: string
  /** The lists the panel can show, the first by default; more than one get a switch. */
  lists: { id: ListId; label: string }[]
  /** Where he lived, over the list (Airports). */
  homes?: boolean
  /** Decade and scope filters (Explore). */
  filters?: boolean
}

/** Each tab's panel, laid out as the log is: a head, then rows. */
export const PANELS: Record<Exclude<TabId, 'log'>, PanelSpec> = {
  explore: {
    eyebrow: 'Explore',
    title: 'Over to you',
    intro: coarse
      ? 'Drag to spin it, pinch to zoom. Tap anything in these tabs to light its flights and fly there.'
      : 'Drag to spin it, pinch or ctrl-scroll to zoom. Hover anything in these tabs to light its flights, click to fly there, and press Esc to clear.',
    lists: [],
    filters: true,
  },
  trips: {
    eyebrow: 'Trips',
    title: `${fmt(LISTS.trips.rows.length)} trips`,
    intro: `Using Steve's own trip markers, biggest first. ${LIGHT}`,
    lists: [{ id: 'trips', label: 'Most legs' }],
  },
  airports: {
    eyebrow: 'Airports',
    title: `${fmt(LISTS.airports.rows.length)} airports`,
    intro: `Every field he flew in or out of, by legs. ${LIGHT}`,
    lists: [{ id: 'airports', label: 'Most visited' }],
    homes: true,
  },
  planes: {
    eyebrow: 'Aircraft',
    title: `${fmt(LISTS.planes.rows.length)} aircraft`,
    intro: `Across ${fmt(LISTS.families.rows.length)} types. ${LIGHT}`,
    lists: [
      { id: 'families', label: 'Types' },
      { id: 'planes', label: 'Aircraft' },
    ],
  },
  airlines: {
    eyebrow: 'Airlines',
    title: `${fmt(LISTS.airlines.rows.length)} airlines`,
    intro: 'By legs, including the ones that no longer exist.',
    lists: [{ id: 'airlines', label: 'Most flown' }],
  },
}
