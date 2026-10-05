import { useEffect, useState } from 'react'
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

/** The tab bar's height in CSS px (before the phone scale) and its top on desktop. */
export const TAB_HEIGHT = 32
const TAB_TOP = 24

/** Where the tab bar sits: across the top of the page on desktop, along the bottom of the pinned globe on phones. */
export const tabBarTop = (layout: Layout) => (layout.phone ? layout.stage.height - (TAB_HEIGHT + 8) * layout.scale : TAB_TOP)
export const tabBarBottom = (layout: Layout) => tabBarTop(layout) + TAB_HEIGHT * layout.scale

/** The window size, for the HTML on top of the canvas. */
export function useViewport() {
  const [size, setSize] = useState(() => ({ width: innerWidth, height: innerHeight }))
  useEffect(() => {
    const resize = () => setSize({ width: innerWidth, height: innerHeight })
    addEventListener('resize', resize)
    return () => removeEventListener('resize', resize)
  }, [])
  return size
}
