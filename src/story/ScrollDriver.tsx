import { useEffect } from 'react'
import { useStory } from '../state/store'
import { CHAPTERS, type Chapter } from './chapters'
import { activeAt, progressAt } from './scrollPlan'
import { planReady, scroll } from './scrollState'
import { hashParams } from '../hash'
import { FLIGHT, STORY_END, timeline } from './timeline'
import { jump } from './jump'
import { distance } from './distance'
import { PACING } from './pacing'
import { ease } from '../motion'

/** Above this many legs of catch-up outside the chapter's range, cut instead of animating. */
const SNAP_LEGS = 250

const ids = (list: number[] = []) => list.map((id) => id - 1)
/** Chapters small enough to frame whole keep every leg's airports in view (Nik); big ones keep their authored shot. */
const FIT_LEGS = 40
const SHOTS = CHAPTERS.map((ch) => {
  const lit = ids(ch.highlight)
  const range = ch.range && !ch.hold && ch.range[1] - ch.range[0] < FIT_LEGS ? Array.from({ length: ch.range[1] - ch.range[0] + 1 }, (_, k) => ch.range![0] - 1 + k) : []
  const fit = lit.length ? lit : range
  return fit.length ? { ...ch.shot, fit } : ch.shot
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
    let live = true
    planReady.then((plan) => {
      const seg = plan.segments[index]
      if (live && seg) window.scrollTo(0, seg.at + 1 + (seg.until - seg.at - 2) * at)
    })
    return () => void (live = false)
  }, [])

  return null
}

/** One frame of the story, run by StoryTick before the tabs and the highlight. */
export function stepScroll(delta: number) {
  const plan = scroll.plan
  if (!plan) return
  const dt = Math.min(delta, 0.1)
  const y = window.scrollY
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
  const lapsTarget = ch.scene === 'laps' ? p : index > LAPS_INDEX ? 1 : 0
  const moonTarget = ch.scene === 'moon' ? p : index > MOON_INDEX ? 1 : 0
  jump.progress = ch.jump ? jump.progress + (jumpTarget - jump.progress) * follow : jumpTarget
  distance.laps = ch.scene === 'laps' ? distance.laps + (lapsTarget - distance.laps) * follow : lapsTarget
  distance.moon = ch.scene === 'moon' ? distance.moon + (moonTarget - distance.moon) * follow : moonTarget
  scroll.active = index
  scroll.progress = p
}
