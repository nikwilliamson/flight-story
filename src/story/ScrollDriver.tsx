import { useEffect } from 'react'
import { useStory, type Shot } from '../state/store'
import { CHAPTERS, type Chapter } from './chapters'
import { activeAt, progressAt } from './scrollPlan'
import { onPlan, planReady, scroll, scrollTop, scrollToY } from './scrollState'
import type { Plan } from './scrollPlan'
import { hashParams } from '../hash'
import { FLIGHT, STORY_END, timeline } from './timeline'
import { jump } from './jump'
import { distance } from './distance'
import { PACING } from './pacing'
import { ease } from '../motion'

/** Anything the reader does to move the page, which ends a deep link's hold on its chapter. */
const TAKEOVER = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

/** Above this many legs of catch-up outside the chapter's range, cut instead of animating. */
const SNAP_LEGS = 250

const ids = (list: number[] = []) => list.map((id) => id - 1)
/**
 * Chapters small enough to frame whole keep every leg's airports in view (Nik); big ones follow the legs as they draw,
 * so Osaka's camera isn't left over the ocean while the flying happens in Asia (Nik).
 */
const FIT_LEGS = 40
const SHOTS = CHAPTERS.map((ch): Shot => {
  const lit = ids(ch.highlight)
  if (lit.length) return { ...ch.shot, fit: lit }
  if (!ch.range || ch.hold) return ch.shot
  const [first, last] = [ch.range[0] - 1, ch.range[1] - 1]
  if (last - first + 1 >= FIT_LEGS) return { ...ch.shot, follow: [first, last] }
  return { ...ch.shot, fit: Array.from({ length: last - first + 1 }, (_, k) => first + k) }
})

const JUMP_INDEX = CHAPTERS.findIndex((c) => c.jump)
const LAPS_INDEX = CHAPTERS.findIndex((c) => c.scene === 'laps')
const MOON_INDEX = CHAPTERS.findIndex((c) => c.scene === 'moon')


/** Story time at chapter progress p: legs scrub from the first's takeoff to the last's landing. */
function timeFor(ch: Chapter, p: number) {
  if (!ch.range) return STORY_END
  const start = ch.range[0] - 1
  const end = ch.range[1] - 1 + FLIGHT
  return ch.hold ? end : start + (end - start) * p
}

/**
 * Runs the story off the page scroll, the wireframe's original way (Nik): the scroll scrubs everything. A chapter
 * takes over when its card pins; the camera heads for its shot at once and the lines draw with the scroll while the
 * card stays pinned, both easing so a flick of the wheel never jumps. Scrolling back up runs it backwards.
 */
const state = { active: -1, shown: STORY_END, tab: false, easing: false }

export function ScrollDriver() {
  // #ch=hockey scrolls to that chapter once the cards are laid out (screenshots, sharing a chapter); &p=0.5 stops
  // part-way through it instead of at its end.
  useEffect(() => {
    const id = hashParams.get('ch')
    const at = Math.min(0.999, Math.max(0, Number(hashParams.get('p') ?? 0.999) || 0))
    const index = CHAPTERS.findIndex((c) => c.id === id)
    if (index < 0) return
    // Cards above it keep growing as their photos and fonts land, which moves the chapter down the page: follow it
    // until the reader takes over.
    const go = (plan: Plan) => {
      const seg = plan.segments[index]
      if (seg) scrollToY(seg.at + 1 + (seg.until - seg.at - 2) * at)
    }
    let live = true
    // planReady holds the first plan; by now a later one may have replaced it.
    planReady.then(() => live && scroll.plan && go(scroll.plan))
    const off = onPlan(go)
    const stop = () => {
      off()
      for (const e of TAKEOVER) window.removeEventListener(e, stop, true)
    }
    for (const e of TAKEOVER) window.addEventListener(e, stop, { capture: true, passive: true })
    return () => {
      live = false
      stop()
    }
  }, [])

  // ← and → step a chapter at a time (the page still scrolls freely): → to the next chapter's start, ← back to the
  // start of this one, or the one before if this one has barely begun.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.target instanceof HTMLInputElement || useStory.getState().tab !== null || !scroll.plan) return
      e.preventDefault()
      const here = Math.max(0, scroll.active)
      const index = e.key === 'ArrowRight' ? here + 1 : scroll.progress > 0.1 ? here : here - 1
      const seg = scroll.plan.segments[Math.max(0, Math.min(CHAPTERS.length - 1, index))]
      scrollToY(seg.at + 1, true)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  return null
}

/** One frame of the story, run by StoryTick before the tabs and the highlight. */
export function stepScroll(delta: number) {
  const plan = scroll.plan
  if (!plan) return
  const dt = Math.min(delta, 0.1)
  const y = scrollTop()
  // An open tab shows the whole log, as at the story's end, without moving the page (Nik): the journey keeps its
  // place underneath, and closing the tab takes the globe back to it. The lines ease both ways rather than snap.
  const tab = useStory.getState().tab !== null
  if (tab !== state.tab) {
    state.tab = tab
    state.easing = true
  }
  const index = tab ? CHAPTERS.length - 1 : activeAt(plan, y)
  const ch = CHAPTERS[index]
  const p = tab ? 1 : progressAt(plan, index, y)

  if (index !== state.active) {
    state.active = index
    const store = useStory.getState()
    store.setShot(SHOTS[index])
    store.setHighlight(ids(ch.highlight))
    store.setInteractive(index === CHAPTERS.length - 1)
  }

  const follow = ease(dt, PACING.follow)
  const target = timeFor(ch, p)
  const gap = target - state.shown
  const inChapter = ch.range && state.shown >= ch.range[0] - 1 && state.shown <= ch.range[1] + FLIGHT
  if (Math.abs(gap) < 1) state.easing = false
  state.shown = Math.abs(gap) > SNAP_LEGS && !inChapter && !state.easing ? target : state.shown + gap * follow

  timeline.time = state.shown
  timeline.focusFrom = ch.range && !ch.hold ? ch.range[0] - 1 : Infinity
  timeline.reveal = !!ch.hold
  // The footage scrubs with the jump's scroll; the distance line laps in its first chapter, unspools to the Moon in
  // the second, and is simply finished (or not yet started) anywhere else.
  const jumpTarget = ch.jump ? p : index > JUMP_INDEX ? 1 : 0
  const lapsTarget = ch.scene === 'laps' ? p ** PACING.windUp : index > LAPS_INDEX ? 1 : 0
  const moonTarget = ch.scene === 'moon' ? p ** PACING.windUp : index > MOON_INDEX ? 1 : 0
  jump.progress = ch.jump ? jump.progress + (jumpTarget - jump.progress) * follow : jumpTarget
  distance.laps = ch.scene === 'laps' ? distance.laps + (lapsTarget - distance.laps) * follow : lapsTarget
  distance.moon = ch.scene === 'moon' ? distance.moon + (moonTarget - distance.moon) * follow : moonTarget
  scroll.active = index
  scroll.progress = p
}
