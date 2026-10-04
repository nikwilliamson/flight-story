import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { settledOn } from '../scene/camera/StoryCamera'
import { useStory } from '../state/store'
import { CHAPTERS, type Chapter } from './chapters'
import { activeAt } from './scrollPlan'
import { scroll } from './scrollState'
import { FLIGHT, STORY_END, timeline } from './timeline'
import { jump } from './jump'
import { distance } from './distance'
import { PACING, playFor } from './pacing'

/** Above this many legs of catch-up outside the chapter's range, cut instead of animating. */
const SNAP_LEGS = 250

/** Chapters small enough to frame whole keep every leg's airports in view (Nik); big ones keep their authored shot. */
const FIT_LEGS = 40
const SHOTS = CHAPTERS.map((ch) => {
  const lit = ids(ch.highlight)
  const range = ch.range && !ch.hold && ch.range[1] - ch.range[0] < FIT_LEGS ? Array.from({ length: ch.range[1] - ch.range[0] + 1 }, (_, k) => ch.range![0] - 1 + k) : []
  const fit = lit.length ? lit : range
  return fit.length ? { ...ch.shot, fit } : ch.shot
})

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const ids = (list: number[] = []) => list.map((id) => id - 1)
const JUMP_INDEX = CHAPTERS.findIndex((c) => c.jump)
const LAPS_INDEX = CHAPTERS.findIndex((c) => c.scene === 'laps')
const MOON_INDEX = CHAPTERS.findIndex((c) => c.scene === 'moon')

/** Seconds a chapter plays for (pacing.ts). Big chapters get longer so a few hundred legs never read as skipped. */
export function durationOf(ch: Chapter) {
  if (ch.jump) return PACING.jump
  if (ch.scene) return PACING[ch.scene]
  if (!ch.range || ch.hold) return PACING.hold
  return playFor(ch.range[1] - ch.range[0] + 1)
}

/** Story time at chapter progress p: legs scrub from the first's takeoff to the last's landing. */
function timeFor(ch: Chapter, p: number) {
  if (!ch.range) return STORY_END
  const start = ch.range[0] - 1
  const end = ch.range[1] - 1 + FLIGHT
  return ch.hold ? end : start + (end - start) * p
}

/**
 * Runs the story (camera-spec.md, minus the scrolljacking). The page scrolls freely; a chapter takes over when its
 * card crosses the reading line. The camera retargets at once, and once it is visually there plus a beat the chapter
 * plays on its own clock, however fast or slow the reader scrolls. Scrolling back up shows a chapter's end state.
 */
/**
 * The distance section holds the page while it plays (Nik: a fixed animation that scrolljacks): scrolling on is
 * swallowed until the chapter's clock runs out, scrolling back up still works. `y` is where the page is held.
 */
const pin = { on: false, y: 0 }
const DOWN_KEYS = new Set(['ArrowDown', 'PageDown', 'End', ' '])

function usePin() {
  useEffect(() => {
    let touchY = 0
    const wheel = (e: WheelEvent) => pin.on && e.deltaY > 0 && e.preventDefault()
    const touchstart = (e: TouchEvent) => void (touchY = e.touches[0]?.clientY ?? 0)
    // A finger moving up the screen scrolls the page down.
    const touchmove = (e: TouchEvent) => pin.on && (e.touches[0]?.clientY ?? touchY) < touchY && e.preventDefault()
    const keydown = (e: KeyboardEvent) => pin.on && DOWN_KEYS.has(e.key) && e.preventDefault()
    addEventListener('wheel', wheel, { passive: false })
    addEventListener('touchstart', touchstart, { passive: true })
    addEventListener('touchmove', touchmove, { passive: false })
    addEventListener('keydown', keydown)
    return () => {
      removeEventListener('wheel', wheel)
      removeEventListener('touchstart', touchstart)
      removeEventListener('touchmove', touchmove)
      removeEventListener('keydown', keydown)
    }
  }, [])
}

export function ScrollDriver() {
  usePin()
  const state = useRef({ active: -1, gateOpen: true, settledFor: 0, elapsed: 0, shown: STORY_END, startAt: -1 }).current

  // #ch=hockey scrolls to that chapter once the cards are laid out (screenshots, sharing a chapter); &p=0.5 starts
  // its playback half-way through instead of at its end.
  useEffect(() => {
    const params = new URLSearchParams(location.hash.slice(1))
    const id = params.get('ch')
    const at = Math.min(0.999, Math.max(0, Number(params.get('p') ?? 0.999) || 0))
    const index = CHAPTERS.findIndex((c) => c.id === id)
    if (index < 0) return
    const timer = setInterval(() => {
      const seg = scroll.plan?.segments[index]
      if (!seg) return
      clearInterval(timer)
      state.startAt = at
      window.scrollTo(0, seg.at + 1)
    }, 100)
    return () => clearInterval(timer)
  }, [])

  useFrame((_, delta) => {
    const plan = scroll.plan
    if (!plan) return
    const dt = Math.min(delta, 0.1)
    const y = window.scrollY
    const index = activeAt(plan, y)
    const ch = CHAPTERS[index]
    const duration = durationOf(ch)

    if (index !== state.active) {
      const back = index < state.active
      state.gateOpen = back || reduceMotion()
      state.settledFor = 0
      state.elapsed = back || reduceMotion() ? duration : 0
      if (state.startAt >= 0) {
        state.elapsed = state.startAt * duration
        state.startAt = -1
      }
      state.active = index
      const store = useStory.getState()
      store.setShot(SHOTS[index])
      store.setHighlight(ids(ch.highlight))
      store.setInteractive(index === CHAPTERS.length - 1)
    }

    state.settledFor = settledOn(SHOTS[index]) ? state.settledFor + dt : 0
    if (!state.gateOpen && (ch.shot.spin || state.settledFor > PACING.lineDelay)) state.gateOpen = true
    if (state.gateOpen) state.elapsed = Math.min(duration, state.elapsed + dt)

    const pinned = PACING.pinDistance && !!ch.scene && state.elapsed < duration && !reduceMotion()
    if (pinned && !pin.on) {
      // Hold the card where it took over; ease back if a flick carried the page past it.
      pin.y = Math.min(y, plan.segments[index].at + innerHeight * 0.15)
      if (y > pin.y + 2) window.scrollTo({ top: pin.y, behavior: 'smooth' })
    }
    // Momentum or the scrollbar can still get past the listeners: pull the page back.
    if (pinned && y > pin.y + innerHeight * 0.3) window.scrollTo(0, pin.y)
    pin.on = pinned
    const p = state.elapsed / duration

    const target = timeFor(ch, p)
    const gap = target - state.shown
    const inChapter = ch.range && state.shown >= ch.range[0] - 1 && state.shown <= ch.range[1] + FLIGHT
    state.shown = (Math.abs(gap) > SNAP_LEGS && !inChapter) || reduceMotion() ? target : state.shown + gap * (1 - Math.exp(-dt * 6))

    timeline.time = state.shown
    timeline.focusFrom = ch.range && !ch.hold ? ch.range[0] - 1 : Infinity
    timeline.reveal = !!ch.hold
    // The footage plays in real time on the chapter's clock; the distance line laps in its first chapter, unspools to
    // the Moon in the second, and is simply finished (or not yet started) anywhere else.
    jump.progress = ch.jump ? p : index > JUMP_INDEX ? 1 : 0
    distance.laps = ch.scene === 'laps' ? p : index > LAPS_INDEX ? 1 : 0
    distance.moon = ch.scene === 'moon' ? p : index > MOON_INDEX ? 1 : 0
    scroll.active = index
    scroll.progress = p
  })
  return null
}
