import { airports, legs } from '../data'
import { airlineGroups, airportGroups, familyGroups, planeGroups, tripGroups } from '../data/indexes'

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
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** A trip's name: Steve's own purpose where he wrote one, otherwise its route. */
function tripLabel(purpose: string | null, route: number[]) {
  if (purpose) return purpose
  const codes = route.map((i) => (i >= 0 ? airports[i].code : '?'))
  return codes.length > 5 ? `${codes.slice(0, 4).join('–')}… ${codes.at(-1)}` : codes.join('–')
}

export const LISTS: Record<ListId, List> = {
  trips: {
    id: 'trips',
    noun: 'legs',
    rows: tripGroups.map((t) => ({ id: `trip-${t.key}`, label: tripLabel(t.purpose, t.route), detail: month(t.start), count: t.count, legs: Array.from(t.legs) })),
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
