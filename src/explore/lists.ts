import { airports, legs } from '../data'
import { airlineGroups, airportGroups, familyGroups, planeGroups, tripGroups } from '../data/indexes'
import { tripName } from '../data/tripNames'
import { HOME_PLACES } from '../content/homes'

/** One row of a tab's list: what it lights on hover and frames on click is `legs` (0-based leg indices). */
export interface ListRow {
  /** Stable id, also the share link (#trip-266, #airport-mco, #plane-g-virg, #airline-ua, #family-b747). */
  id: string
  label: string
  /** Secondary text: a city, a year range, a trip's dates. Dropped first when space is short. */
  detail?: string
  /** Shown on the right; every list ranks by legs, most first (Nik). */
  count: number
  /** "gone" on defunct airlines, "closed" on closed airports. */
  tag?: string
  legs: readonly number[]
}

export interface List {
  id: ListId
  /** Column heading for the count. */
  noun: string
  rows: ListRow[]
}

export type ListId = 'trips' | 'airports' | 'families' | 'planes' | 'airlines'

const years = (a: string, b: string) => (a.slice(0, 4) === b.slice(0, 4) ? a.slice(0, 4) : `${a.slice(0, 4)}–${b.slice(0, 4)}`)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const month = (d: string) => (d.length >= 7 ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : d.slice(0, 4))
/** A trip's start: the day where the log is sure of it, so same-named trips in one month tell apart. */
const day = (d: string, exact: boolean) => (exact && d.length >= 10 ? `${Number(d.slice(8, 10))} ${month(d)}` : month(d))
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')


export const LISTS: Record<ListId, List> = {
  trips: {
    id: 'trips',
    noun: 'legs',
    rows: tripGroups.map((t) => ({ id: `trip-${t.key}`, label: tripName(t.purpose, t.legs), detail: day(t.start, legs[t.legs[0]].precision === 'Exact'), count: t.count, legs: Array.from(t.legs) })),
  },
  airports: {
    id: 'airports',
    noun: 'legs',
    rows: airportGroups.map((g) => {
      const a = airports[Number(g.key)]
      return { id: `airport-${slug(a.closed ? `${a.code}-${a.closed.slice(0, 4)}` : a.code)}`, label: `${a.code} · ${a.city}`, detail: a.country, count: g.count, tag: a.closed ? 'closed' : undefined, legs: Array.from(g.legs) }
    }),
  },
  families: {
    id: 'families',
    noun: 'legs',
    rows: familyGroups.map((g) => ({ id: `family-${slug(g.key)}`, label: g.label, count: g.count, legs: Array.from(g.legs) })),
  },
  planes: {
    id: 'planes',
    noun: 'legs',
    rows: planeGroups.map((g) => {
      const first = legs[g.legs[0]]
      const last = legs[g.legs[g.legs.length - 1]]
      return { id: `plane-${slug(g.key)}`, label: `${g.key} · ${first.aircraft ?? ''}`.replace(/ · $/, ''), detail: years(first.sort, last.sort), count: g.count, legs: Array.from(g.legs) }
    }),
  },
  airlines: {
    id: 'airlines',
    noun: 'legs',
    rows: airlineGroups.map((g) => ({ id: `airline-${slug(g.key)}`, label: g.label, detail: g.defunct ? `last flown ${g.lastYear}` : undefined, count: g.count, tag: g.defunct ? 'gone' : undefined, legs: Array.from(g.legs) })),
  },
}

// A few keys only differ in punctuation (the log has both "AS" and ".AS." for Alaska): number the repeats so every
// share link is unique.
{
  const seen = new Map<string, number>()
  for (const list of Object.values(LISTS))
    for (const row of list.rows) {
      const n = (seen.get(row.id) ?? 0) + 1
      seen.set(row.id, n)
      if (n > 1) row.id = `${row.id}-${n}`
    }
}

/** Every row by share id, for #links. */
export const ROWS = new Map(Object.values(LISTS).flatMap((l) => l.rows.map((r) => [r.id, r] as const)))

/** Explore's filter chips: decades, then domestic and international. */
export const CHIPS: ListRow[] = (() => {
  const decades = new Map<number, number[]>()
  legs.forEach((l, i) => {
    const d = Math.floor(Number(l.sort.slice(0, 4)) / 10) * 10
    decades.set(d, [...(decades.get(d) ?? []), i])
  })
  const scope = (intl: boolean) => legs.flatMap((l, i) => (l.intl === intl ? [i] : []))
  return [
    ...[...decades].sort((a, b) => a[0] - b[0]).map(([d, set]) => ({ id: `decade-${d}`, label: `${d}s`, count: set.length, legs: set })),
    { id: 'scope-domestic', label: 'Domestic', count: scope(false).length, legs: scope(false) },
    { id: 'scope-international', label: 'International', count: scope(true).length, legs: scope(true) },
  ]
})()

for (const chip of CHIPS) ROWS.set(chip.id, chip)

/** Each airport's row, by airport index, for picking airports straight off the globe. */
export const AIRPORT_ROWS = new Map(airportGroups.map((g, k) => [Number(g.key), LISTS.airports.rows[k]]))

/** A stretch of the log flown from one home airport. */
export interface HomeRow extends ListRow {
  /** The bar's tag (LON, CT, BOS…). */
  short: string
  /** Years as decimals, for laying the stretch out on a timeline. */
  from: number
  to: number
}

const yearOf = (sort: string) => Number(sort.slice(0, 4)) + (sort.length >= 7 ? (Number(sort.slice(5, 7)) - 1) / 12 : 0)

/** Where he lived, as stretches of the log (homes and moves are Nik's, pinned in build_data.py). */
export const HOMES: HomeRow[] = (() => {
  const out: HomeRow[] = []
  legs.forEach((l, i) => {
    const last = out.at(-1)
    if (last && l.home === legs[last.legs[0]].home) (last.legs as number[]).push(i)
    else if (l.home >= 0) {
      const a = airports[l.home]
      const [place, tag] = HOME_PLACES[a.code] ?? [a.city, a.code]
      out.push({ id: `home-${slug(a.code)}-${l.sort.slice(0, 4)}`, label: place, short: tag, count: 0, legs: [i], from: yearOf(l.sort), to: 0 })
    }
  })
  out.forEach((h, k) => {
    h.count = h.legs.length
    h.to = out[k + 1]?.from ?? yearOf(legs[legs.length - 1].sort) + 1
    h.detail = `${Math.floor(h.from)}–${k + 1 < out.length ? Math.floor(h.to) : 'now'}`
  })
  return out
})()

for (const home of HOMES) ROWS.set(home.id, home)
