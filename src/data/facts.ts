import { airports, legs } from '.'
import { airlineGroups, familyGroups, planeGroups } from './indexes'
import type { Leg } from './types'

/**
 * Every number the story quotes, computed from flights.json at load so it updates as flights are added
 * (Nik, 2026-10-04). Hand-researched stories live in content/ and are keyed to legs, not computed here.
 */

export const EARTH_CIRCUMFERENCE_MI = 24_901
export const MOON_DISTANCE_MI = 238_855
const LIGHT_MI_PER_S = 186_282
/** Air time estimate Nik confirmed: 30 min on the ground per airline leg plus a 480 mph cruise. */
const GROUND_HOURS = 0.5
const CRUISE_MPH = 480

/** Logged miles, else great-circle; the 13 unknown "?" legs carry 750 mi placeholders and count. */
const milesOf = (leg: Leg) => leg.miles ?? 0
const sumMiles = (list: readonly Leg[]) => list.reduce((s, l) => s + milesOf(l), 0)
const year = (leg: Leg) => Number(leg.sort.slice(0, 4))
const known = (leg: Leg) => leg.from >= 0 && leg.to >= 0
const legsBetween = (first: number, last: number) => legs.slice(first - 1, last)
/** Osaka years: move out SFO→KIX on leg 408, back home on 601 (Universal Studios Japan, Nik). */
const OSAKA_LEGS = [408, 601] as const
/** First leg of "30 Games in 30 Nights"; the whole trip is its Trip ID. */
const HOCKEY_FIRST_LEG = 748

function maxBy<T>(items: Iterable<T>, score: (t: T) => number): T {
  let best: T | undefined
  let bestScore = -Infinity
  for (const item of items) {
    const s = score(item)
    if (s > bestScore) [best, bestScore] = [item, s]
  }
  return best!
}

function countBy<T>(list: readonly T[], keyOf: (t: T) => string | number | null): Map<string | number, T[]> {
  const out = new Map<string | number, T[]>()
  for (const item of list) {
    const key = keyOf(item)
    if (key === null) continue
    const list = out.get(key)
    if (list) list.push(item)
    else out.set(key, [item])
  }
  return out
}

/** Summary of any run of legs: a chapter, a trip, the whole log. */
export function span(list: readonly Leg[]) {
  const visited = new Set(list.flatMap((l) => [l.from, l.to]).filter((i) => i >= 0))
  const miles = sumMiles(list)
  return {
    legs: list.length,
    miles,
    laps: miles / EARTH_CIRCUMFERENCE_MI,
    airports: visited.size,
    countries: new Set([...visited].map((i) => airports[i].country)).size,
    airlines: new Set(list.map((l) => l.airline).filter(Boolean)).size,
  }
}

const crossesEquator = (l: Leg) => known(l) && Math.sign(airports[l.from].lat) !== Math.sign(airports[l.to].lat)
/** The shorter great-circle way round crosses 180° when the longitudes are more than 180° apart. */
const crossesDateLine = (l: Leg) => known(l) && Math.abs(airports[l.from].lon - airports[l.to].lon) > 180

const total = span(legs)
const byYear = countBy(legs, year)
const byDate = countBy(legs, (l) => l.date)
const longest = [...legs].sort((a, b) => milesOf(b) - milesOf(a))
const ages = legs.filter((l) => l.built).map((l) => year(l) - l.built!)
const airTimeHours = legs.filter((l) => l.type === 'Airline').reduce((h, l) => h + GROUND_HOURS + milesOf(l) / CRUISE_MPH, 0)
const routeKey = (l: Leg) => (known(l) && l.from !== l.to ? [airports[l.from].code, airports[l.to].code].sort().join('–') : null)
const intl = legs.filter((l) => l.intl)
const home = (code: string) => airports.findIndex((a) => a.code === code && !a.closed)
const orlando = home('MCO')

const bestYearEntry = maxBy(byYear, ([, list]) => sumMiles(list))
const busiestYearEntry = maxBy(byYear, ([, list]) => list.length)
const busiestDayEntry = maxBy(byDate, ([, list]) => list.length)

export const facts = {
  ...total,
  moonTrips: total.miles / (2 * MOON_DISTANCE_MI),
  lightSeconds: total.miles / LIGHT_MI_PER_S,
  airTimeDays: airTimeHours / 24,
  averageLeg: total.miles / total.legs,
  types: new Set(legs.map((l) => l.aircraft).filter(Boolean)).size,
  families: familyGroups.length,
  planes: planeGroups.length,
  bestYear: { year: Number(bestYearEntry[0]), ...span(bestYearEntry[1]) },
  busiestYear: { year: Number(busiestYearEntry[0]), ...span(busiestYearEntry[1]) },
  busiestDay: { date: String(busiestDayEntry[0]), legs: busiestDayEntry[1].map((l) => l.id) },
  longest: longest.slice(0, 10).map((l) => ({ id: l.id, miles: milesOf(l) })),
  orlandoLegs: legs.filter((l) => l.from === orlando || l.to === orlando).length,
  topRoutes: [...countBy(legs, routeKey)].map(([route, list]) => ({ route: String(route), legs: list.length })).sort((a, b) => b.legs - a.legs).slice(0, 5),
  international: { legs: intl.length, miles: sumMiles(intl) },
  equatorCrossings: legs.filter(crossesEquator).length,
  dateLineCrossings: legs.filter(crossesDateLine).length,
  averagePlaneAge: ages.reduce((a, b) => a + b, 0) / ages.length,
  /** Legs on a plane in its first year (built the year he flew it, or listed as built later). */
  newPlaneLegs: ages.filter((a) => a <= 0).length,
  /** Airports he used that have since closed, with how many legs touched each, most first. */
  closedAirports: [...countBy(legs.flatMap((l) => [...new Set([l.from, l.to])].filter((i) => i >= 0 && airports[i].closed)), (i) => i)]
    .map(([i, list]) => ({ airport: airports[Number(i)], legs: list.length }))
    .sort((a, b) => b.legs - a.legs),
  topAirline: airlineGroups[0],
  defunctAirlineLegs: airlineGroups.filter((g) => g.defunct).reduce((n, g) => n + g.count, 0),
  jumbo: span(legs.filter((l) => l.family === 'B747')),
  /** Story chapters, by leg id range (ids are the chronology). */
  osaka: span(legsBetween(...OSAKA_LEGS)),
  hockey: span(legs.filter((l) => l.trip === legs[HOCKEY_FIRST_LEG - 1].trip)),
}

export type Facts = typeof facts

/** Story copy formatting: whole numbers get separators, ratios one decimal. */
export const fmt = (n: number, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
