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

/** Lines wait this long after the camera arrives before the chapter starts playing (Nik, buffer rule). */
const LINE_DELAY_S = 0.35
/** Above this many legs of catch-up outside the chapter's range, cut instead of animating. */
const SNAP_LEGS = 250

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const ids = (list: number[] = []) => list.map((id) => id - 1)
const JUMP_INDEX = CHAPTERS.findIndex((c) => c.jump)
const LAPS_INDEX = CHAPTERS.findIndex((c) => c.scene === 'laps')
const MOON_INDEX = CHAPTERS.findIndex((c) => c.scene === 'moon')

/**
 * Seconds a chapter plays for. Big chapters get longer so a few hundred legs never read as skipped (Nik): roughly
 * 40 ms a leg on top of a couple of seconds, capped so the reader isn't kept waiting.
 */
export function durationOf(ch: Chapter) {
  if (ch.duration) return ch.duration
  if (!ch.range || ch.hold) return 2
  const legs = ch.range[1] - ch.range[0] + 1
  return Math.min(14, Math.max(3, 2 + legs * 0.04))
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
export function ScrollDriver() {
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
      store.setShot(ch.shot)
      store.setHighlight(ids(ch.highlight))
      store.setInteractive(index === CHAPTERS.length - 1)
    }

    state.settledFor = settledOn(ch.shot) ? state.settledFor + dt : 0
    if (!state.gateOpen && (ch.shot.spin || state.settledFor > LINE_DELAY_S)) state.gateOpen = true
    if (state.gateOpen) state.elapsed = Math.min(duration, state.elapsed + dt)
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
