import { ui } from './tokens'

const MILLION = '1,000,000'

/** The title's colours: the million in the accent. The loader draws the opening title with the same ones. */
export function titleRanges(title: string) {
  const million = title.indexOf(MILLION)
  return million >= 0 ? { 0: ui.ink, [million]: ui.accent, [million + MILLION.length]: ui.ink } : undefined
}

/** The title split around the million, for the HTML card. */
export function titleParts(title: string): [string, string, string] {
  const million = title.indexOf(MILLION)
  return million < 0 ? [title, '', ''] : [title.slice(0, million), MILLION, title.slice(million + MILLION.length)]
}

/**
 * Where the opening card's title sits on screen once laid out (known), so the loader can draw it in the same place
 * and lift away around it: the match cut from the loading screen into the story.
 */
export const openingTitle = { known: false, x: 0, y: 0, width: 0, s: 1 }
