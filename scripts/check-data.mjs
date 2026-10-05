// CI guard for the generated flights.json: shape, chronology, and nothing private (the repo and the site are public).
import { readFileSync } from 'node:fs'

const data = JSON.parse(readFileSync(new URL('../src/data/flights.json', import.meta.url)))
const errors = []
const fail = (msg) => errors.push(msg)
const FORBIDDEN = ['fare', 'hotel', 'bonus', 'notes']
const SHOWN = new Set(Object.keys(JSON.parse(readFileSync(new URL('../src/content/trip-names.json', import.meta.url)))))

data.legs.forEach((leg, i) => {
  if (leg.id !== i + 1) fail(`leg ${i + 1}: id ${leg.id} out of sequence (ids are the chronology)`)
  for (const key of Object.keys(leg)) if (FORBIDDEN.some((f) => key.toLowerCase().includes(f))) fail(`leg ${leg.id}: private field "${key}"`)
  if (leg.purpose !== null && !SHOWN.has(leg.purpose)) fail(`leg ${leg.id}: purpose "${leg.purpose}" is not on the shown list`)
  for (const end of ['from', 'to']) {
    if (leg[end] >= 0 && leg[`${end}Name`] !== null) fail(`leg ${leg.id}: ${end}Name kept for a known airport`)
    const idx = leg[end]
    if (idx >= data.airports.length) fail(`leg ${leg.id}: ${end} index ${idx} has no airport`)
    if (idx < 0 && leg.candidates.length === 0 && !leg.fromName && !leg.toName) fail(`leg ${leg.id}: unknown ${end} with no candidates`)
  }
  // Same-field joyrides and some unknown-origin "?" legs legitimately have no distance.
  const measurable = leg.from >= 0 && leg.to >= 0 && leg.from !== leg.to
  if (measurable && !(leg.miles > 0)) fail(`leg ${leg.id}: no miles`)
})
data.airports.forEach((a, i) => {
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) fail(`airport ${i} (${a.code}): no coordinates`)
})

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`flights.json ok: ${data.legs.length} legs, ${data.airports.length} airports`)
