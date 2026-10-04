import { airports, legs } from '../data'
import type { Leg } from '../data/types'

/**
 * Story time, measured in legs: leg i takes off at i and lands at i + FLIGHT. Scroll writes `timeline.time` (each
 * chapter maps its progress onto its leg range); the scene reads it every frame. STORY_END is the finished globe.
 */
export const FLIGHT = 1
export const STORY_END = legs.length + FLIGHT
export const legStart = Float64Array.from(legs, (_, i) => i)

export const timeline = {
  time: STORY_END,
  /** First leg of the chapter on screen: it and later legs draw bright, earlier ones settle into dim history. */
  focusFrom: Infinity,
  /** Lit legs show even if the timeline hasn't reached them (asides that break chronology, the tabs). */
  reveal: false,
}

/** Last index whose key is <= t (binary search); -1 when t is before the first. */
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

/** Legs that have landed by time t. */
export const landedAt = (t: number) => Math.max(0, Math.min(legs.length, Math.floor(t - FLIGHT) + 1))

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

export const visitsAt = (airport: number, t: number) => lastAtOrBefore(visitTimes[airport].length, (k) => visitTimes[airport][k], t) + 1

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT = MONTHS.map((m) => m.slice(0, 3))

/** A leg's date in words, as precise as the logbook is. */
export function legDate(leg: Leg): string {
  const [y, m, d] = leg.sort.split('-').map(Number)
  switch (leg.precision) {
    case 'Exact':
      return `${d} ${SHORT[m - 1]} ${y}`
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
