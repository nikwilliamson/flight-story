import { describe, expect, it } from 'vitest'
import { shotFor, tabOf } from '../src/explore/explore'
import { CHIPS, LISTS, ROWS } from '../src/explore/lists'
import { legs } from '../src/data'

describe('tab lists', () => {
  it('rank every list by legs, most first', () => {
    for (const list of Object.values(LISTS)) list.rows.forEach((r, i) => i && expect(list.rows[i - 1].count).toBeGreaterThanOrEqual(r.count))
  })

  it('give every row a unique share link that opens the right tab', () => {
    const ids = Object.values(LISTS).flatMap((l) => l.rows.map((r) => r.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(tabOf('trip-266')).toBe('trips')
    expect(tabOf('plane-g-virg')).toBe('planes')
    expect(ROWS.get('trip-266')?.count).toBe(35)
    expect(ROWS.get('airport-mco')).toBeDefined()
    expect(ROWS.get('plane-g-virg')).toBeDefined()
  })

  it('split the log exactly into decades', () => {
    expect(CHIPS.filter((c) => c.id.startsWith('decade')).reduce((n, c) => n + c.count, 0)).toBe(legs.length)
  })

  it('frame a selection on its airports', () => {
    const hockey = shotFor(ROWS.get('trip-266')!.legs)!
    expect(hockey.lat).toBeGreaterThan(30)
    expect(hockey.lat).toBeLessThan(60)
    expect(hockey.lon).toBeGreaterThan(-125)
    expect(hockey.lon).toBeLessThan(-70)
    expect(hockey.zoom).toBeGreaterThanOrEqual(1)
    // A whole-world selection stays at the full globe.
    expect(shotFor(legs.map((_, i) => i))?.zoom ?? 1).toBe(1)
  })
})
