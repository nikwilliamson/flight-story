import { airports, legs, totalsThrough } from '../data'
import { Vector3 } from 'three'
import { latLonToVec3 } from '../geo'

/** Mean radii and distance, in kilometres; the scene's unit is one Earth radius. */
const EARTH_RADIUS_KM = 6371
const MOON_RADIUS_KM = 1737.4
const MOON_DISTANCE_KM = 384_400
const MOON_ROUND_TRIP_MI = 2 * 238_855

export const MOON_RADIUS = MOON_RADIUS_KM / EARTH_RADIUS_KM
export const MOON_DISTANCE = MOON_DISTANCE_KM / EARTH_RADIUS_KM
/** Where the Moon sits: a little north of the Atlantic side, so it rises beside the opening view. */
export const MOON_POSITION = latLonToVec3(8, -20, MOON_DISTANCE)

const total = totalsThrough(legs.length).miles
/** How many times the whole log would wrap the Earth at the equator, and how many Earth-Moon round trips it is. */
export const LAPS = totalsThrough(legs.length).aroundEarth
export const MOON_TRIPS = total / MOON_ROUND_TRIP_MI

const mco = airports.findIndex((a) => a.code === 'MCO')
/** Where both drawings start: Orlando, home for most of the log. */
export const ORIGIN = latLonToVec3(airports[mco].lat, airports[mco].lon)

/** The lapping line's frame at Orlando: up, due east (its launch heading), and its orbit's axis. */
export const LAP_FRAME = (() => {
  const up = ORIGIN.clone().normalize()
  // East at the origin: the derivative of position with longitude.
  const east = new Vector3(up.z, 0, -up.x).normalize()
  const axis = new Vector3().crossVectors(up, east).normalize()
  return { up, east, axis }
})()

/**
 * Progress of the distance section, each 0 to 1: the line lapping the Earth, then that same line unspooling onto the
 * figure eight to the Moon and back. `fade` dims the line, and `routes` the globe's own flight lines and airports,
 * which are skipped entirely at 0 while the Moon shot has the screen (1 = fully shown). The story sets these as the
 * reader scrolls; the scene reads them every frame.
 */
export const distance = { laps: 0, moon: 0, fade: 1, routes: 1 }
