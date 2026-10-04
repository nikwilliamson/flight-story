import { describe, expect, it } from 'vitest'
import { activeAt, cardTop, planScroll, progressAt } from '../src/story/scrollPlan'

const H = 800
const column = { top: 0, bottom: H, centre: true }
const cards = [300, 500, 1200, 200].map((height, i) => ({ height, scroll: [800, 3200, 400, 800][i] }))
const plan = planScroll(cards, column)

describe('scroll plan', () => {
  it('shows the first card at load, centred and pinned', () => {
    const [first] = plan.segments
    expect(first.at).toBe(0)
    expect(cardTop(first, 0)).toBe((H - 300) / 2)
    expect(cardTop(first, 400)).toBe((H - 300) / 2)
  })

  it('pins each card for its chapter scroll while the chapter scrubs 0 to 1', () => {
    const s = plan.segments[1]
    expect(s.until - s.at).toBe(3200)
    expect(cardTop(s, s.at)).toBe(cardTop(s, s.until))
    expect(progressAt(plan, 1, s.at)).toBe(0)
    expect(progressAt(plan, 1, (s.at + s.until) / 2)).toBeCloseTo(0.5)
    expect(progressAt(plan, 1, s.until)).toBe(1)
    expect(activeAt(plan, s.at)).toBe(1)
    expect(activeAt(plan, s.at - 5)).toBe(0)
  })

  it('scrolls cards one to one outside their pin, never overlapping', () => {
    for (let i = 1; i < plan.segments.length; i++) {
      const prev = plan.segments[i - 1]
      const cur = plan.segments[i]
      expect(cardTop(cur, cur.at - 100) - cardTop(cur, cur.at)).toBe(100)
      for (const y of [prev.until, (prev.until + cur.at) / 2, cur.at]) expect(cardTop(cur, y)).toBeGreaterThan(cardTop(prev, y) + prev.height)
    }
  })

  it('creeps a tall card up while pinned so its bottom shows', () => {
    const tall = plan.segments[2]
    expect(cardTop(tall, tall.at)).toBe(24)
    expect(cardTop(tall, tall.until) + 1200).toBe(H - 24)
  })

  it('ends with the last card pinned', () => {
    const last = plan.segments.at(-1)!
    expect(plan.length).toBe(last.at)
    expect(progressAt(plan, 3, 0)).toBe(1)
  })
})
