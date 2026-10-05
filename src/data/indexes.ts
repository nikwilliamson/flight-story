import { TYPE_NAMES } from '../content/aircraft'
import { DEFUNCT_AIRLINES } from '../content/airlines'
import { airports, legs } from '.'
import type { Leg } from './types'

/**
 * Leg sets for everything a tab can hover or click, built once at load so a hover is a texture upload, not a scan.
 * Leg sets hold 0-based leg indices (leg id - 1), in chronological order.
 */
export interface Group {
  key: string
  label: string
  /** Number of legs, which is what every list ranks by. */
  count: number
  miles: number
  legs: Uint16Array
}

export interface AirlineGroup extends Group {
  defunct: boolean
  lastYear: number
}

export interface TripGroup extends Group {
  purpose: string | null
  start: string
  end: string
  /** Airport indices in the order the trip visits them, repeats collapsed. */
  route: number[]
}

const year = (leg: Leg) => Number(leg.sort.slice(0, 4))

function groupBy(keyOf: (leg: Leg) => string | string[] | null): Map<string, number[]> {
  const out = new Map<string, number[]>()
  legs.forEach((leg, i) => {
    const keys = keyOf(leg)
    if (keys === null) return
    for (const key of new Set(Array.isArray(keys) ? keys : [keys])) {
      const list = out.get(key)
      if (list) list.push(i)
      else out.set(key, [i])
    }
  })
  return out
}

const milesOf = (set: number[]) => set.reduce((sum, i) => sum + (legs[i].miles ?? 0), 0)

/** Count descending, then label, so ties are stable and lists never reshuffle. */
const byCount = <T extends Group>(a: T, b: T) => b.count - a.count || a.label.localeCompare(b.label)

function ranked<T extends Group>(groups: Map<string, number[]>, make: (key: string, set: number[]) => Omit<T, keyof Group>, label: (key: string, set: number[]) => string): T[] {
  return [...groups]
    .map(([key, set]) => ({ key, label: label(key, set), count: set.length, miles: milesOf(set), legs: Uint16Array.from(set), ...make(key, set) }) as T)
    .sort(byCount)
}

const endpoints = (leg: Leg) => [leg.from, leg.to].filter((i) => i >= 0).map(String)

export const airportGroups = ranked<Group>(groupBy(endpoints), () => ({}), (key) => airports[Number(key)].code)

export const airlineGroups = ranked<AirlineGroup>(
  groupBy((leg) => leg.airline),
  (key, set) => ({ defunct: DEFUNCT_AIRLINES.has(key), lastYear: year(legs[set[set.length - 1]]) }),
  (key, set) => legs[set[0]].airlineName ?? key,
)

export const familyGroups = ranked<Group>(groupBy((leg) => leg.family), () => ({}), (key) => TYPE_NAMES[key] ?? key)

export const planeGroups = ranked<Group>(groupBy((leg) => leg.tail), () => ({}), (key) => key)

export const tripGroups = ranked<TripGroup>(
  groupBy((leg) => String(leg.trip)),
  (_, set) => {
    const route: number[] = []
    for (const i of set) for (const a of [legs[i].from, legs[i].to]) if (route[route.length - 1] !== a) route.push(a)
    const first = legs[set[0]]
    const last = legs[set[set.length - 1]]
    return { purpose: set.map((i) => legs[i].purpose).find(Boolean) ?? null, start: first.date ?? first.sort, end: last.date ?? last.sort, route }
  },
  (key) => `Trip ${key}`,
)

const lookup = <T extends Group>(groups: T[]) => new Map(groups.map((g) => [g.key, g]))

export const groups = {
  airport: lookup(airportGroups),
  airline: lookup(airlineGroups),
  family: lookup(familyGroups),
  plane: lookup(planeGroups),
  trip: lookup(tripGroups),
}
