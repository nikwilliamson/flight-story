import { METRO } from '../content/places'
import { TRIP_BY_LEG, TRIP_NAMES } from '../content/trips'
import { airports, legs } from '.'

const cityOf = (a: number) => METRO[airports[a].code] ?? airports[a].city

/** Great-circle angle between two airports, radians. */
function angle(a: number, b: number) {
  const r = Math.PI / 180
  const [p, q] = [airports[a], airports[b]]
  const c = Math.sin(p.lat * r) * Math.sin(q.lat * r) + Math.cos(p.lat * r) * Math.cos(q.lat * r) * Math.cos((p.lon - q.lon) * r)
  return Math.acos(Math.min(1, Math.max(-1, c)))
}

/**
 * Where a trip went, as cities in the order he got there: every airport he stayed the night at (the next leg leaves on
 * a later day), minus where it started and his home. Undated trips can't tell a stay from a connection, so they take
 * the farthest point from the start; so does a trip that never stayed anywhere.
 */
export function destinations(set: ArrayLike<number>): string[] {
  const list = Array.from(set, (i) => legs[i])
  const start = list[0].from
  const away = (a: number) => a >= 0 && a !== start && a !== list[0].home
  const cities: string[] = []
  const dated = list.every((l) => l.date)
  if (dated)
    list.forEach((l, i) => {
      const next = list[i + 1]
      if (next && next.date !== l.date && away(l.to) && !cities.includes(cityOf(l.to))) cities.push(cityOf(l.to))
    })
  if (cities.length) return cities
  const ends = list.flatMap((l) => [l.from, l.to]).filter(away)
  if (!ends.length) return start >= 0 ? [cityOf(start)] : []
  const far = ends.reduce((best, a) => (start < 0 || angle(start, a) > angle(start, best) ? a : best))
  return [cityOf(far)]
}

/** "Sydney", "Paris and London", "Oslo, Munich and Vienna", "Oslo, Munich and 3 more". */
export function placeName(cities: string[]): string {
  if (cities.length <= 1) return cities[0] ?? 'Somewhere'
  if (cities.length === 2) return cities.join(' and ')
  if (cities.length === 3) return `${cities[0]}, ${cities[1]} and ${cities[2]}`
  return `${cities[0]}, ${cities[1]} and ${cities.length - 2} more`
}

/** A trip's name: Steve's own, where it's one to show, otherwise where it went. A joyride is named after its field. */
export function tripName(purpose: string | null, set: ArrayLike<number>): string {
  const first = legs[set[0]]
  const marked = Array.from(set).find((i) => TRIP_BY_LEG[legs[i].id])
  if (marked !== undefined) return TRIP_BY_LEG[legs[marked].id]
  if (set.length === 1 && first.from === first.to && first.from >= 0) return `${airports[first.from].city} ${first.type === 'Joyride' || first.type === 'Vintage' ? 'joyride' : 'flight'}`
  const named = purpose ? TRIP_NAMES[purpose] : undefined
  const cities = destinations(set)
  if (!named) return placeName(cities)
  return named.place && cities.length ? `${named.name} in ${cities[0]}` : named.name
}
