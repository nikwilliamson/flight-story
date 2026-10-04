import type { Stage } from '../state/store'

export interface Layout {
  /** Where the globe is framed. */
  stage: Stage
  /** The story card column, CSS px from the top-left. */
  card: { x: number; y: number; width: number; height: number }
  /** Type scale multiplier. */
  scale: number
  phone: boolean
}

const PHONE_MAX = 820
/** Phones pin the globe to the top 44% of the screen, cards below it (wireframe). */
const PHONE_STAGE = 0.44
const GUTTER = 16

export function layoutFor(width: number, height: number): Layout {
  if (width <= PHONE_MAX) {
    const stageHeight = Math.round(height * PHONE_STAGE)
    return {
      stage: { x: 0, y: 0, width, height: stageHeight },
      card: { x: GUTTER, y: stageHeight + 8, width: width - 2 * GUTTER, height: height - stageHeight - 8 - GUTTER },
      scale: Math.min(1, width / 430),
      phone: true,
    }
  }
  // Desktop: text left, the globe in the stage to its right.
  const x = Math.max(32, Math.round(width * 0.05))
  const cardWidth = Math.min(460, Math.round(width * 0.34))
  const stageX = x + cardWidth + 24
  return {
    stage: { x: stageX, y: 0, width: width - stageX, height },
    card: { x, y: 0, width: cardWidth, height },
    scale: 1,
    phone: false,
  }
}
