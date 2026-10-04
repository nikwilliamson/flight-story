import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { settledOn } from '../scene/camera/StoryCamera'
import { useStory } from '../state/store'
import { CHAPTERS, type Chapter } from './chapters'
import { activeAt, bufferFor, progressAt } from './scrollPlan'
import { scroll } from './scrollState'
import { FLIGHT, STORY_END, timeline } from './timeline'
import { jump } from './jump'

/** Lines wait this long after the camera arrives before they catch up to the scroll (Nik, buffer rule). */
const LINE_DELAY_S = 0.35
/** Above this many legs of catch-up outside the chapter's range, cut instead of animating. */
const SNAP_LEGS = 250

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const ids = (list: number[] = []) => list.map((id) => id - 1)
const JUMP_INDEX = CHAPTERS.findIndex((c) => c.jump)

/** Story time at chapter progress p: legs scrub from the first's takeoff to the last's landing. */
function timeFor(ch: Chapter, p: number) {
  if (!ch.range) return STORY_END
  const start = ch.range[0] - 1
  const end = ch.range[1] - 1 + FLIGHT
  return ch.hold ? end : start + (end - start) * p
}

/**
 * Runs the story off the page scroll (camera-spec.md). A chapter takes over the moment its card locks: the camera
 * retargets at once, and the lines hold at the chapter's start until the camera is visually there plus a beat,
 * then catch up to the scroll. Scrolling back up shows a chapter's end state straight away.
 */
export function ScrollDriver() {
  const state = useRef({ active: -1, gateOpen: true, settledFor: 0, shown: STORY_END }).current

  // #ch=hockey scrolls to that chapter once the cards are laid out (screenshots, sharing a chapter); &p=0.5 stops
  // part-way through it instead of at its end.
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
      const travel = seg.unlock - seg.lock
      window.scrollTo(0, seg.lock + bufferFor(travel, innerHeight) + (travel - 2 * bufferFor(travel, innerHeight)) * at)
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
    const p = progressAt(plan.segments[index], y, innerHeight)

    if (index !== state.active) {
      state.gateOpen = index < state.active || reduceMotion()
      state.settledFor = 0
      state.active = index
      const store = useStory.getState()
      store.setShot(ch.shot)
      store.setHighlight(ids(ch.highlight))
      store.setInteractive(index === CHAPTERS.length - 1)
    }

    state.settledFor = settledOn(ch.shot) ? state.settledFor + dt : 0
    if (!state.gateOpen && (ch.shot.spin || state.settledFor > LINE_DELAY_S)) state.gateOpen = true

    const target = state.gateOpen ? timeFor(ch, p) : timeFor(ch, 0)
    const gap = target - state.shown
    const inChapter = ch.range && state.shown >= ch.range[0] - 1 && state.shown <= ch.range[1] + FLIGHT
    state.shown = (Math.abs(gap) > SNAP_LEGS && !inChapter) || reduceMotion() ? target : state.shown + gap * (1 - Math.exp(-dt * 6))

    timeline.time = state.shown
    timeline.focusFrom = ch.range && !ch.hold ? ch.range[0] - 1 : Infinity
    timeline.reveal = !!ch.hold
    // The footage scrubs with a little lag so a flick of the wheel doesn't jump frames.
    const jumpTarget = ch.jump ? p : index > JUMP_INDEX ? 1 : 0
    jump.progress = !ch.jump || reduceMotion() ? jumpTarget : jump.progress + (jumpTarget - jump.progress) * (1 - Math.exp(-dt * 8))
    scroll.active = index
    scroll.progress = p
  })
  return null
}
