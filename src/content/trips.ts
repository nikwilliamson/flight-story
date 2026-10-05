import names from './trip-names.json'

/**
 * Trip names Steve wrote that are fit to show, as shown (trip-names.json, shared with scripts/build_data.py). The build
 * keeps only these: everything else he wrote in that column (ticket numbers, hotels, people, family health) and his
 * notes never reach the repo or the page. A trip without one here is named after where it went. `place: true` adds
 * where ("Promax in New Orleans"), for events that recur in different cities.
 */
export const TRIP_NAMES: Record<string, { name: string; place?: boolean }> = names

/** Trips the story tells, named by a leg in them (leg id), whatever Steve wrote. */
export const TRIP_BY_LEG: Record<number, string> = {
  408: 'The move to Osaka',
  601: 'Home from Osaka',
  976: 'Tokyo and the Island Hopper',
  1385: 'The jump',
}
