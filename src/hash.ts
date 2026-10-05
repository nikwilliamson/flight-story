/**
 * The page's hash, read once at load. It carries share links (#trips, #trip-266, #leg-1385) and debug params
 * (#ch=hockey&p=0.5, #shot=…, #hl=…, #raw, #probe); see the README.
 */
export const hashParams = new URLSearchParams(typeof location !== 'undefined' ? location.hash.slice(1) : '')

/** The share link in a hash: its first bare entry (#trip-266&raw → "trip-266"), lower-cased; "" when there is none. */
export function shareIdOf(hash: string) {
  for (const [key, value] of new URLSearchParams(hash.replace(/^#/, ''))) if (value === '') return key.toLowerCase()
  return ''
}
