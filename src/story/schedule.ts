import { airports, legs } from '../data'
import type { Leg } from '../data/types'

/**
 * The story's timetable, in seconds at 1x. Paced by trip, not by calendar: each trip gets a short beat plus a
 * little per leg, legs within a trip take off in quick succession, and each chapter opens with a title card.
 */
const TRIP_BEAT = 0.35
const PER_LEG = 0.55
export const CARD = 3.5
/** How long one leg takes to fly, takeoff to landing. The next leg leaves just before it lands, so a trip reads in order. */
export const FLIGHT = 0.7

export interface Trip {
  index: number
  /** First and last leg index (inclusive). */
  first: number
  last: number
  start: number
  end: number
  chapter: number
}

export interface Chapter {
  title: string
  /** Index of the chapter's first trip. */
  trip: number
  /** When its title card starts; the first trip follows CARD seconds later. */
  start: number
}

/** Home eras, folded so one-leg stopovers don't become chapters (see the story plan). */
const CHAPTERS: { title: string; from: string }[] = [
  { title: 'Barcelona and London', from: '1965-01-01' },
  { title: 'Boston and New York', from: '1978-07-01' },
  { title: 'Fort Lauderdale', from: '1982-07-01' },
  { title: 'Orlando', from: '1988-09-01' },
  // Universal Studios Japan: home was Osaka, with SFO as the connection (Nik, 2026-10-04).
  { title: 'Osaka', from: '2000-04-07' },
  { title: 'Back to Orlando', from: '2002-07-01' },
]

/** Takeoff time of every leg. */
export const legStart = new Float64Array(legs.length)
export const trips: Trip[] = []
export const chapters: Chapter[] = []

{
  let t = 0
  let chapter = -1
  let i = 0
  while (i < legs.length) {
    let last = i
    while (last + 1 < legs.length && legs[last + 1].trip === legs[i].trip) last++
    const next = CHAPTERS[chapter + 1]
    if (next && legs[i].sort >= next.from) {
      chapter++
      chapters.push({ title: next.title, trip: trips.length, start: t })
      t += CARD
    }
    const start = t
    for (let j = i; j <= last; j++) legStart[j] = t + (j - i) * PER_LEG
    t += TRIP_BEAT + (last - i + 1) * PER_LEG
    trips.push({ index: trips.length, first: i, last, start, end: t, chapter: Math.max(chapter, 0) })
    i = last + 1
  }
}

/** The finished globe: every leg landed. */
export const STORY_END = trips[trips.length - 1].end + FLIGHT + 0.4

/** Last item whose key is <= t (binary search); -1 when t is before the first. */
function lastAtOrBefore(n: number, key: (i: number) => number, t: number) {
  let lo = 0
  let hi = n - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (key(mid) <= t) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

/** Trip playing at time t (the last one to have started), or -1 before the first. */
export const tripAt = (t: number) => lastAtOrBefore(trips.length, (i) => trips[i].start, t)
/** Leg most recently taken off at time t, or -1 before the first. */
export const legAt = (t: number) => lastAtOrBefore(legs.length, (k) => legStart[k], t)
/** Legs that have landed by time t. */
export const landedAt = (t: number) => lastAtOrBefore(legs.length, (i) => legStart[i] + FLIGHT, t) + 1
/** Chapter whose card or trips are on at time t. */
export const chapterAt = (t: number) => Math.max(0, lastAtOrBefore(chapters.length, (i) => chapters[i].start, t))
/** Chapter whose title card is showing at t, or -1. */
export const cardAt = (t: number) => {
  const c = chapterAt(t)
  return t >= chapters[c].start && t < chapters[c].start + CARD ? c : -1
}

/** Every move: when the first leg from a new home takes off, and the home it left. */
const moves: { time: number; home: number; from: number }[] = []
legs.forEach((leg, i) => {
  const prev = moves[moves.length - 1]
  if (!prev || prev.home !== leg.home) moves.push({ time: i === 0 ? -Infinity : legStart[i], home: leg.home, from: prev?.home ?? -1 })
})

/** Home airport at time t: the home of the leg most recently taken off. */
export const homeAt = (t: number) => moves[Math.max(0, lastAtOrBefore(moves.length, (k) => moves[k].time, t))].home

/** The latest move at or before t, for handing the home ring from the old airport to the new one. */
export const moveAt = (t: number) => moves[Math.max(0, lastAtOrBefore(moves.length, (k) => moves[k].time, t))]

/** Each airport's visit times: departures at takeoff, arrivals at landing. Sorted ascending. */
export const visitTimes: number[][] = (() => {
  const times = airports.map(() => [] as number[])
  legs.forEach((leg, i) => {
    if (leg.from >= 0) times[leg.from].push(legStart[i])
    if (leg.to >= 0 && leg.to !== leg.from) times[leg.to].push(legStart[i] + FLIGHT)
  })
  times.forEach((list) => list.sort((a, b) => a - b))
  return times
})()

export const visitsAt = (airport: number, t: number) =>
  lastAtOrBefore(visitTimes[airport].length, (k) => visitTimes[airport][k], t) + 1

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT = MONTHS.map((m) => m.slice(0, 3))

/** A leg's date in words, as precise as the logbook is. */
export function legDate(leg: Leg): string {
  const [y, m, d] = leg.sort.split('-').map(Number)
  switch (leg.precision) {
    case 'Exact':
      return `${SHORT[m - 1]} ${d}, ${y}`
    case 'Month':
      return `${MONTHS[m - 1]} ${y}`
    case 'Range':
      return leg.detail ?? `${MONTHS[m - 1]} ${y}`
    case 'Year':
      return `c. ${y}`
    default:
      return 'Date unknown'
  }
}

/** The trip's dates: one date, or first to last. */
export function tripDates(trip: Trip): string {
  const a = legDate(legs[trip.first])
  const b = legDate(legs[trip.last])
  return a === b ? a : `${a} to ${b}`
}

/** The route as a chain of airport codes, collapsing a leg that starts where the last one ended. */
export function tripRoute(trip: Trip): string[] {
  const codes: string[] = []
  const code = (i: number, name: string | null) => (i >= 0 ? airports[i].code : name ?? '?')
  for (let j = trip.first; j <= trip.last; j++) {
    const leg = legs[j]
    const from = code(leg.from, leg.fromName)
    if (codes.at(-1) !== from) codes.push(from)
    codes.push(code(leg.to, leg.toName))
  }
  return codes
}

/** Calendar position (fractional year) of time t, for the year-bars scrubber. */
export function yearAt(t: number): number {
  const i = Math.min(legs.length - 1, Math.max(0, lastAtOrBefore(legs.length, (k) => legStart[k], t)))
  const frac = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return y + ((m - 1) * 30.4 + (d - 1)) / 365
  }
  const here = frac(legs[i].sort)
  if (i + 1 >= legs.length || t <= legStart[i]) return here
  const next = frac(legs[i + 1].sort)
  return here + (next - here) * Math.min(1, (t - legStart[i]) / Math.max(1e-6, legStart[i + 1] - legStart[i]))
}

/** First trip on or after a fractional year: where a click on the scrubber lands. */
export function tripAtYear(year: number): number {
  const y = Math.floor(year)
  const m = Math.min(12, Math.floor((year - y) * 12) + 1)
  const key = `${y}-${String(m).padStart(2, '0')}`
  const k = trips.findIndex((trip) => legs[trip.first].sort >= key)
  return k < 0 ? trips.length - 1 : k
}
