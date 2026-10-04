// Packs GeoNames cities (population >= 1,000, via the all-the-cities package) into a compact binary
// for the city-lights layer: per city int16 lat*300, int16 lon*150, uint8 log-population.
// Usage: node scripts/build_cities.mjs <path-to-all-the-cities> src/assets/cities.bin
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const [, , pkg, out] = process.argv
const cities = createRequire(import.meta.url)(pkg)
const list = cities.filter((c) => c.population >= 1000).sort((a, b) => b.population - a.population)
const buf = Buffer.alloc(list.length * 5)
list.forEach((c, i) => {
  const [lon, lat] = c.loc.coordinates
  buf.writeInt16LE(Math.round(lat * 300), i * 5)
  buf.writeInt16LE(Math.round(lon * 150), i * 5 + 2)
  // 1k -> 0, 25M -> 255
  const p = (Math.log10(c.population) - 3) / (Math.log10(2.5e7) - 3)
  buf.writeUInt8(Math.max(0, Math.min(255, Math.round(p * 255))), i * 5 + 4)
})
writeFileSync(out, buf)
console.log(`${list.length} cities, ${buf.length} bytes`)
