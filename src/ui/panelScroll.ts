import { useEffect } from 'react'
import { useStory } from '../state/store'

/**
 * An open tab's panel scrolls on its own (Nik: tab sections didn't scroll at all). The page stays put underneath so
 * the journey keeps its place; wheel and swipes outside the globe's stage move the panel instead, with a flick
 * carrying on and easing out.
 */
export const panelScroll = {
  /** Shown offset, px: how far the panel has moved up. */
  offset: 0,
  target: 0,
  max: 0,
  velocity: 0,
  /** A finger is on the panel: it moves 1:1 and the flick waits for the release. */
  touching: false,
  /** Set once a touch has moved far enough to be a scroll, so the tap that ends it doesn't pick a row. */
  dragged: false,
}

/** A touch that moves less than this is a tap. */
const TAP_PX = 8
/** Fraction of a flick's speed kept per second. */
const FRICTION = 0.04
/** How fast the shown offset catches the target, per second. */
const FOLLOW = 18

const clamp = (v: number) => Math.max(0, Math.min(panelScroll.max, v))

export function resetPanelScroll() {
  Object.assign(panelScroll, { offset: 0, target: 0, max: 0, velocity: 0, dragged: false })
}

/** Outside the globe's stage: the panel's side of the screen. */
function onPanel(x: number, y: number) {
  const { stage, tab, sheet } = useStory.getState()
  if (tab === null || tab === 'log' || sheet || !stage) return false
  return x < stage.x || x > stage.x + stage.width || y < stage.y || y > stage.y + stage.height
}

export function stepPanelScroll(delta: number) {
  const dt = Math.min(delta, 0.1)
  if (panelScroll.velocity && !panelScroll.touching) {
    panelScroll.target = clamp(panelScroll.target + panelScroll.velocity * dt)
    panelScroll.velocity *= Math.pow(FRICTION, dt)
    if (Math.abs(panelScroll.velocity) < 5 || panelScroll.target === 0 || panelScroll.target === panelScroll.max) panelScroll.velocity = 0
  }
  panelScroll.target = clamp(panelScroll.target)
  panelScroll.offset += (panelScroll.target - panelScroll.offset) * Math.min(1, dt * FOLLOW)
}

/** Wires wheel and touch to the panel while a tab is open. */
export function usePanelScrollInput() {
  useEffect(() => {
    let touch: { id: number; y: number; startY: number; t: number } | null = null
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || useStory.getState().tab === null || useStory.getState().tab === 'log' || useStory.getState().sheet) return
      // The page never scrolls under an open tab; over the globe the wheel does nothing, over the panel it scrolls it.
      e.preventDefault()
      if (!onPanel(e.clientX, e.clientY)) return
      panelScroll.velocity = 0
      panelScroll.target = clamp(panelScroll.target + e.deltaY * (e.deltaMode === 1 ? 32 : 1))
    }
    const start = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      if (e.touches.length !== 1 || !onPanel(t.clientX, t.clientY)) return (touch = null)
      touch = { id: t.identifier, y: t.clientY, startY: t.clientY, t: performance.now() }
      panelScroll.velocity = 0
      panelScroll.dragged = false
      panelScroll.touching = true
    }
    const move = (e: TouchEvent) => {
      if (!touch) return
      const t = [...e.changedTouches].find((c) => c.identifier === touch!.id)
      if (!t) return
      e.preventDefault()
      const now = performance.now()
      const dy = touch.y - t.clientY
      if (Math.abs(t.clientY - touch.startY) > TAP_PX) panelScroll.dragged = true
      panelScroll.target = clamp(panelScroll.target + dy)
      // Pixels per second, smoothed so the last jittery sample doesn't decide the flick.
      const v = (dy / Math.max(1, now - touch.t)) * 1000
      panelScroll.velocity = panelScroll.velocity * 0.6 + v * 0.4
      panelScroll.offset = panelScroll.target
      touch.y = t.clientY
      touch.t = now
    }
    const end = () => {
      // A finger that stopped before lifting doesn't flick.
      if (touch && performance.now() - touch.t > 80) panelScroll.velocity = 0
      touch = null
      panelScroll.touching = false
    }
    addEventListener('wheel', wheel, { passive: false })
    addEventListener('touchstart', start, { passive: true })
    addEventListener('touchmove', move, { passive: false })
    addEventListener('touchend', end)
    addEventListener('touchcancel', end)
    return () => {
      removeEventListener('wheel', wheel)
      removeEventListener('touchstart', start)
      removeEventListener('touchmove', move)
      removeEventListener('touchend', end)
      removeEventListener('touchcancel', end)
    }
  }, [])
}
