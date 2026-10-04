import { describe, expect, it } from 'vitest'
import { activeAt, cardTop, planScroll, progressAt } from '../src/story/scrollPlan'

const H = 800
const column = { top: 0, bottom: H, centre: true, line: H * 0.8 }
const cards = [300, 500, 1200, 200].map((height, i) => ({ height, scroll: [800, 3200, 400, 800][i] }))
const plan = planScroll(cards, column)

describe('scroll plan', () => {
  it('shows the first card at load, centred', () => {
    expect(plan.segments[0].at).toBe(0)
    expect(cardTop(plan.segments[0], 0)).toBe((H - 300) / 2)
  })

  it('scrolls cards with the page, one to one, never overlapping', () => {
    for (let i = 1; i < plan.segments.length; i++) {
      const prev = plan.segments[i - 1]
      const cur = plan.segments[i]
      expect(cur.top).toBeGreaterThan(prev.top + prev.height)
      expect(cardTop(cur, 100) - cardTop(cur, 0)).toBe(-100)
    }
  })

  it('hands over as each card crosses the reading line', () => {
    plan.segments.forEach((s, i) => {
      if (i === 0) return
      expect(cardTop(s, s.at)).toBeCloseTo(column.line)
      expect(activeAt(plan, s.at)).toBe(i)
      expect(activeAt(plan, s.at - 5)).toBe(i - 1)
    })
  })

  it('gives each chapter after the opening its scroll, or at least its card plus a gap', () => {
    expect(plan.segments[2].at - plan.segments[1].at).toBe(3200)
    expect(plan.segments[3].at - plan.segments[2].at).toBeGreaterThan(1200)
  })

  it('scrubs each chapter from 0 at its takeover to 1 at the next', () => {
    const [, b, c] = plan.segments
    expect(progressAt(plan, 1, b.at)).toBe(0)
    expect(progressAt(plan, 1, (b.at + c.at) / 2)).toBeCloseTo(0.5)
    expect(progressAt(plan, 1, c.at)).toBe(1)
    expect(progressAt(plan, 3, 0)).toBe(1)
  })

  it('scrolls far enough for the last card to take over and show whole', () => {
    const last = plan.segments.at(-1)!
    expect(plan.length).toBeGreaterThanOrEqual(last.at)
    expect(cardTop(last, plan.length) + last.height).toBeLessThanOrEqual(H)
  })
})
