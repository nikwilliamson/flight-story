/** Insets (CSS px) the HUD takes from each edge of the screen; the story frames its flights inside what is left. */
export interface Insets {
  left: number
  right: number
  top: number
  bottom: number
}

const PANELS = ['.masthead', '.rail-left', '.rail-right', '.years']
/** Breathing room between a flight and the panels around it. */
const GAP = 24

/**
 * Measures the HUD panels and assigns each to the edge it hugs: side columns on desktop, stacked bands on phones.
 * Hidden panels measure 0 x 0 and are skipped.
 */
export function measureInsets(width: number, height: number): Insets {
  // Even with no panel on a side, keep flights off the very edge of the screen.
  const insets: Insets = { left: GAP, right: GAP, top: GAP, bottom: GAP }
  for (const selector of PANELS) {
    const el = document.querySelector(selector)
    if (!el) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const cx = (r.left + r.right) / 2
    const cy = (r.top + r.bottom) / 2
    if (r.width < width * 0.4 && cx < width * 0.3) insets.left = Math.max(insets.left, r.right + GAP)
    else if (r.width < width * 0.4 && cx > width * 0.7) insets.right = Math.max(insets.right, width - r.left + GAP)
    else if (cy > height / 2) insets.bottom = Math.max(insets.bottom, height - r.top + GAP)
    else insets.top = Math.max(insets.top, r.bottom + GAP)
  }
  // Never let the panels squeeze the frame to nothing.
  const squeeze = (a: number, b: number, size: number) => {
    const over = a + b - size * 0.6
    return over > 0 ? [a - over / 2, b - over / 2] : [a, b]
  }
  ;[insets.left, insets.right] = squeeze(insets.left, insets.right, width)
  ;[insets.top, insets.bottom] = squeeze(insets.top, insets.bottom, height)
  return insets
}
