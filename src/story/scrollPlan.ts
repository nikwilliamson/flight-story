/**
 * Where every story card sits for any scroll position, in CSS px. Pure, so it can be tested without a browser.
 *
 * The scroll scrubs the story (the wireframe's original way), and each card pins while its globe events run (Nik):
 * a card scrolls up to its pinned spot, holds there for its chapter's scroll length while the scroll draws its legs,
 * then scrolls away as the next card comes up. A card taller than the column scrolls on until its foot is in view, so all of it
 * gets read.
 */
export interface Segment {
  /** Viewport y of the card's top while pinned (before a tall card scrolls on). */
  pinned: number
  height: number
  /** How far a tall card scrolls on past its pin spot before holding, so its foot shows. */
  overflow: number
  /** Scroll position at which the card pins and its chapter takes over. */
  at: number
  /** Scroll position at which it unpins: its chapter has finished. */
  until: number
}

export interface Plan {
  segments: Segment[]
  /** Total scroll height of the story, past the viewport. */
  length: number
}

export interface Card {
  height: number
  /** Scroll the chapter runs over while its card is pinned, px. */
  scroll: number
}

/** Room between one card leaving and the next arriving. */
const GAP = 96
const MARGIN = 24

/**
 * `top` / `bottom` = the card column's span on screen; `centre` = pin cards centred in it (desktop) rather than at
 * its top (phones, just under the globe).
 */
export function planScroll(cards: Card[], column: { top: number; bottom: number; centre: boolean }): Plan {
  const room = column.bottom - column.top
  const segments: Segment[] = []
  cards.forEach(({ height, scroll }, i) => {
    const fits = height + 2 * MARGIN <= room
    const pinned = column.top + (fits && column.centre ? (room - height) / 2 : MARGIN)
    const overflow = fits ? 0 : height + 2 * MARGIN - room
    const prev = segments[i - 1]
    // The next card pins only once the previous one has scrolled clean off the column (Nik: they overlapped at the
    // end), and never closer than a gap behind it on the way.
    const gone = prev ? prev.pinned - prev.overflow + prev.height - column.top + GAP / 2 : 0
    const behind = prev ? prev.pinned - prev.overflow + prev.height + GAP - pinned : 0
    const at = prev ? prev.until + Math.max(GAP, gone, behind) : 0
    segments.push({ pinned, height, overflow, at, until: at + overflow + scroll })
  })
  const last = segments.at(-1)
  return { segments, length: last ? last.at : 0 }
}

/** How far through chapter i's pin the scroll is, 0–1. The last chapter is always done. */
export function progressAt(plan: Plan, i: number, scroll: number) {
  const seg = plan.segments[i]
  if (!seg || i === plan.segments.length - 1) return 1
  return Math.min(1, Math.max(0, (scroll - seg.at) / Math.max(1, seg.until - seg.at)))
}

/** Viewport y of a card's top at this scroll position. */
export function cardTop(seg: Segment, scroll: number) {
  if (scroll < seg.at) return seg.pinned + (seg.at - scroll)
  if (scroll > seg.until) return seg.pinned - seg.overflow - (scroll - seg.until)
  // A card taller than the column keeps scrolling with the page until its foot is in view (Nik: on phones, where
  // nearly every card is taller than the strip, creeping it over the whole chapter made it feel stuck), then holds.
  return seg.pinned - Math.min(seg.overflow, scroll - seg.at)
}

/** Index of the chapter whose card pinned most recently. */
export function activeAt(plan: Plan, scroll: number) {
  let idx = 0
  plan.segments.forEach((s, i) => {
    if (scroll >= s.at - 0.5) idx = i
  })
  return idx
}
