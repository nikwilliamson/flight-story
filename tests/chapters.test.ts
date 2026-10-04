import { describe, expect, it } from 'vitest'
import { CHAPTERS } from '../src/story/chapters'
import { legs } from '../src/data'
import { facts } from '../src/data/facts'
import { STORIES } from '../src/content/stories'

describe('chapters', () => {
  it('keep their leg ranges inside the log and in order', () => {
    let previous = 0
    for (const ch of CHAPTERS) {
      if (!ch.range || ch.hold) continue
      const [a, b] = ch.range
      expect(a).toBeGreaterThan(0)
      expect(b).toBeLessThanOrEqual(legs.length)
      expect(a).toBeGreaterThan(previous)
      previous = b
    }
  })

  it('never show a placeholder or an undefined value', () => {
    // Empty nights in the calendar are null on purpose; everything else must be filled.
    const modules = (m: (typeof CHAPTERS)[number]['modules']) => m.filter((x) => x.kind !== 'nights')
    const text = JSON.stringify(CHAPTERS.map(({ title, body, modules: m }) => ({ title, body, modules: modules(m) })))
    expect(text).not.toMatch(/undefined|NaN|null/)
  })

  it('key every hand-written story to a real leg', () => {
    for (const id of Object.keys(STORIES).map(Number)) expect(legs[id - 1]?.id).toBe(id)
  })

  it('has exactly one jump, lit on the skydive', () => {
    const jumps = CHAPTERS.filter((c) => c.jump)
    expect(jumps).toHaveLength(1)
    expect(legs[jumps[0].highlight![0] - 1]).toMatchObject({ tail: 'N41DZ', type: 'Joyride' })
  })

  it('lists the closed airports, most used first', () => {
    expect(facts.closedAirports.map((c) => c.airport.code)).toEqual(expect.arrayContaining(['BKK', 'MUC', 'DEN', 'IST']))
    expect(facts.closedAirports[0]).toMatchObject({ airport: { code: 'BKK' }, legs: 13 })
  })
})
