/**
 * Where every story card sits for any scroll position, in CSS px. Pure, so it can be tested without a browser.
 *
 * Each card scrolls in from below with the page, locks at its pin line for `travel` px (the chapter runs while it
 * is locked), then scrolls away with the page as the next one rises. Cards never overlap: the gap between one
 * unlocking and the next locking is long enough for the old one to clear and the new one to start off screen.
 */
export interface CardSize {
  height: number
  /** Scroll while locked, as a share of the viewport height. */
  travel: number
}

export interface Segment {
  /** Viewport y of the card's top while locked. */
  pin: number
  /** Scroll position at which the card locks and its chapter takes over. */
  lock: number
  unlock: number
  height: number
  /** How far the card slides up while locked, for cards taller than the room under the pin. */
  overflow: number
}

export interface Plan {
  segments: Segment[]
  /** Total scroll height of the story, past the viewport. */
  length: number
}

/** Rest at each end of a chapter's locked scroll (camera-spec.md): 18% of the viewport, at most 30% of the travel. */
const BUFFER = 0.18
const GAP = 32
const MARGIN = 24

export const bufferFor = (travel: number, viewport: number) => Math.min(BUFFER * viewport, travel * 0.3)

/** `top` = the card column's top; `bottom` = its bottom; `centre` = vertically centre cards in that span. */
export function planScroll(cards: CardSize[], viewport: number, column: { top: number; bottom: number; centre: boolean }): Plan {
  const room = column.bottom - column.top
  const segments: Segment[] = []
  let cursor = 0
  cards.forEach((card, i) => {
    const pin = column.centre ? column.top + Math.max(MARGIN, (room - card.height) / 2) : column.top
    const overflow = Math.max(0, card.height - (column.bottom - pin) + MARGIN)
    if (i > 0) {
      const prev = segments[i - 1]
      const clearOld = prev.pin - prev.overflow + prev.height + GAP - pin
      const startBelow = viewport - pin
      cursor = prev.unlock + Math.max(clearOld, startBelow)
    }
    const travel = Math.max(card.travel * viewport, overflow + 2 * bufferFor(card.travel * viewport, viewport))
    segments.push({ pin, lock: cursor, unlock: cursor + travel, height: card.height, overflow })
  })
  return { segments, length: segments.at(-1)?.unlock ?? 0 }
}

/** Chapter progress 0–1 inside its locked scroll, with the rest at each end. */
export function progressAt(seg: Segment, scroll: number, viewport: number) {
  const travel = seg.unlock - seg.lock
  const buf = bufferFor(travel, viewport)
  return Math.min(1, Math.max(0, (scroll - seg.lock - buf) / Math.max(1, travel - 2 * buf)))
}

/** Viewport y of a card's top at this scroll position. */
export function cardTop(seg: Segment, scroll: number, viewport: number) {
  if (scroll < seg.lock) return seg.pin + (seg.lock - scroll)
  if (scroll > seg.unlock) return seg.pin - seg.overflow - (scroll - seg.unlock)
  const p = progressAt(seg, scroll, viewport)
  // A tall card slides up while locked so its bottom comes into view by the end of the chapter.
  return seg.pin - seg.overflow * p * p * (3 - 2 * p)
}

/** Index of the chapter whose card has locked most recently. */
export function activeAt(plan: Plan, scroll: number) {
  let idx = 0
  plan.segments.forEach((s, i) => {
    if (scroll >= s.lock - 0.5) idx = i
  })
  return idx
}
