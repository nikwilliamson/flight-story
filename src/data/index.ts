import raw from './flights.json'
import { CITY_NAMES } from '../content/places'
import type { FlightData, Leg } from './types'

export const data = raw as FlightData
export const { airports, legs } = data
for (const a of airports) a.city = CITY_NAMES[a.code] ?? a.city

const EARTH_CIRCUMFERENCE_MI = 24_901
/** Rough block time: 30 min taxi/climb overhead plus cruise at ~500 mph. */
const estimateHours = (miles: number) => 0.5 + miles / 500

const countedMiles = (leg: Leg) => (leg.milesPlaceholder ? 0 : leg.miles ?? 0)

export interface Totals {
  flights: number
  airports: number
  countries: number
  miles: number
  hours: number
  aroundEarth: number
}

/** Totals over the first `count` legs, so the HUD can tick with the playhead later. */
export function totalsThrough(count: number): Totals {
  const visited = new Set<number>()
  const countries = new Set<string>()
  let miles = 0
  let hours = 0
  for (const leg of legs.slice(0, count)) {
    for (const idx of [leg.from, leg.to]) {
      if (idx < 0) continue
      visited.add(idx)
      countries.add(airports[idx].country)
    }
    const m = countedMiles(leg)
    miles += m
    if (m > 0) hours += estimateHours(m)
  }
  return {
    flights: count,
    airports: visited.size,
    countries: countries.size,
    miles,
    hours,
    aroundEarth: miles / EARTH_CIRCUMFERENCE_MI,
  }
}

/** Visits (departures + arrivals) per airport index. */
export const visitCounts: number[] = (() => {
  const counts = new Array<number>(airports.length).fill(0)
  for (const leg of legs) {
    if (leg.from >= 0) counts[leg.from]++
    if (leg.to >= 0 && leg.to !== leg.from) counts[leg.to]++
  }
  return counts
})()

/** Top countries by airport visits over the first `count` legs (all legs by default). */
export function topCountries(limit: number, count = legs.length): { country: string; visits: number }[] {
  const byCountry = new Map<string, number>()
  const add = (idx: number) => {
    if (idx < 0) return
    const c = airports[idx].country
    byCountry.set(c, (byCountry.get(c) ?? 0) + 1)
  }
  for (const leg of legs.slice(0, count)) {
    add(leg.from)
    if (leg.to !== leg.from) add(leg.to)
  }
  return [...byCountry]
    .map(([country, visits]) => ({ country, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, limit)
}

export function flightsPerYear(): { year: number; count: number }[] {
  const counts = new Map<number, number>()
  for (const leg of legs) {
    const y = Number(leg.sort.slice(0, 4))
    counts.set(y, (counts.get(y) ?? 0) + 1)
  }
  const years = [...counts.keys()]
  const out = []
  for (let y = Math.min(...years); y <= Math.max(...years); y++) out.push({ year: y, count: counts.get(y) ?? 0 })
  return out
}

/** Airport index he was based at during the last leg. */
export const currentHome = legs[legs.length - 1].home
