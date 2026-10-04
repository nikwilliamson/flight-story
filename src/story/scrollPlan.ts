/**
 * Where every story card sits for any scroll position, in CSS px. Pure, so it can be tested without a browser.
 *
 * No scrolljacking (Nik): the cards are an ordinary column that scrolls with the page, a breathing gap between each.
 * A chapter takes over when its card's top crosses the reading line; what it then does on the globe plays on its own
 * clock (ScrollDriver), however fast or slow the reader scrolls.
 */
export interface Segment {
  /** Page y of the card's top. */
  top: number
  height: number
  /** Scroll position at which the card's top reaches the reading line and its chapter takes over. */
  at: number
}

export interface Plan {
  segments: Segment[]
  /** Total scroll height of the story, past the viewport. */
  length: number
}

/** Room between cards, as a share of the column's height: enough to watch a chapter play before the next arrives. */
const GAP = 0.5
const MARGIN = 24

/**
 * `top` / `bottom` = the card column's span on screen; `centre` = start the first card centred in it (desktop);
 * `line` = the reading line, the viewport y a card's top crosses to take over.
 */
export function planScroll(heights: number[], column: { top: number; bottom: number; centre: boolean; line: number }): Plan {
  const room = column.bottom - column.top
  const gap = Math.max(160, room * GAP)
  const segments: Segment[] = []
  heights.forEach((height, i) => {
    const top = i === 0 ? column.top + (column.centre ? Math.max(MARGIN, (room - height) / 2) : MARGIN) : segments[i - 1].top + segments[i - 1].height + gap
    segments.push({ top, height, at: i === 0 ? 0 : top - column.line })
  })
  const last = segments.at(-1)
  // Far enough for the last card to take over and sit wholly on screen.
  const length = last ? Math.max(last.at, last.top + last.height + MARGIN - column.bottom) : 0
  return { segments, length }
}

/** Viewport y of a card's top at this scroll position. */
export const cardTop = (seg: Segment, scroll: number) => seg.top - scroll

/** Index of the chapter whose card crossed the reading line most recently. */
export function activeAt(plan: Plan, scroll: number) {
  let idx = 0
  plan.segments.forEach((s, i) => {
    if (scroll >= s.at - 0.5) idx = i
  })
  return idx
}
