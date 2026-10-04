import { describe, expect, it } from 'vitest'
import { activeAt, cardTop, planScroll, progressAt } from '../src/story/scrollPlan'

const H = 800
const column = { top: 0, bottom: H, centre: true }
const plan = planScroll(
  [
    { height: 300, travel: 1 },
    { height: 500, travel: 1.5 },
    { height: 1200, travel: 1 },
  ],
  H,
  column,
)

describe('scroll plan', () => {
  it('locks the first card at load', () => {
    expect(plan.segments[0].lock).toBe(0)
    expect(cardTop(plan.segments[0], 0, H)).toBe(plan.segments[0].pin)
  })

  it('starts each new card off screen as the last one unlocks', () => {
    for (let i = 1; i < plan.segments.length; i++) expect(cardTop(plan.segments[i], plan.segments[i - 1].unlock, H)).toBeGreaterThanOrEqual(H)
  })

  it('never overlaps two cards', () => {
    for (let scroll = 0; scroll < plan.length; scroll += 7) {
      for (let i = 1; i < plan.segments.length; i++) {
        const prev = plan.segments[i - 1]
        const cur = plan.segments[i]
        expect(cardTop(cur, scroll, H)).toBeGreaterThanOrEqual(cardTop(prev, scroll, H) + prev.height - 0.01)
      }
    }
  })

  it('reveals the bottom of a card taller than the screen while it is locked', () => {
    const tall = plan.segments[2]
    expect(tall.overflow).toBeGreaterThan(0)
    expect(cardTop(tall, tall.unlock, H) + tall.height).toBeLessThanOrEqual(H)
  })

  it('holds progress at 0 and 1 in the rest at each end', () => {
    const s = plan.segments[1]
    expect(progressAt(s, s.lock + 10, H)).toBe(0)
    expect(progressAt(s, s.unlock - 10, H)).toBe(1)
    expect(activeAt(plan, s.lock)).toBe(1)
    expect(activeAt(plan, s.lock - 5)).toBe(0)
  })
})
