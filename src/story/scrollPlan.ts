/**
 * Where every story card sits for any scroll position, in CSS px. Pure, so it can be tested without a browser.
 *
 * No scrolljacking (Nik): the cards are an ordinary column that scrolls with the page. A chapter takes over when its
 * card's top crosses the reading line, and the scroll from there to the next card's takeover runs it from start to
 * finish (the wireframe's original scroll-scrubbing). A chapter's scroll length is the room it needs to draw its
 * legs, so the empty space under a big chapter's card is where its lines draw.
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

/** Least room between one card's bottom and the next card's top. */
const MIN_GAP = 120
const MARGIN = 24

export interface Card {
  height: number
  /** Scroll the chapter runs over, px. */
  scroll: number
}

/**
 * `top` / `bottom` = the card column's span on screen; `centre` = start the first card centred in it (desktop);
 * `line` = the reading line, the viewport y a card's top crosses to take over.
 */
export function planScroll(cards: Card[], column: { top: number; bottom: number; centre: boolean; line: number }): Plan {
  const room = column.bottom - column.top
  const segments: Segment[] = []
  cards.forEach(({ height }, i) => {
    const prev = segments[i - 1]
    const top = prev
      ? prev.top + Math.max(prev.height + MIN_GAP, cards[i - 1].scroll)
      : column.top + (column.centre ? Math.max(MARGIN, (room - height) / 2) : MARGIN)
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

/** How far through chapter i the scroll is, 0–1: from its takeover to the next chapter's. The last one is always done. */
export function progressAt(plan: Plan, i: number, scroll: number) {
  const seg = plan.segments[i]
  const next = plan.segments[i + 1]
  if (!seg || !next) return 1
  return Math.min(1, Math.max(0, (scroll - seg.at) / Math.max(1, next.at - seg.at)))
}
