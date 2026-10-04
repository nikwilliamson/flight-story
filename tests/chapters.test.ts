import { describe, expect, it } from 'vitest'
import { CHAPTERS } from '../src/story/chapters'
import { legs } from '../src/data'

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
})
