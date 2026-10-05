import type { Chapter } from './chapters'

/**
 * Every timing knob in the story, in one place to tune by hand. The story is scroll-scrubbed, so pacing is scroll
 * distance: lengths are in screen heights of scrolling. `npm run dev` hot-reloads this file, and `#ch=hockey&p=0`
 * jumps to the start of a chapter.
 */
export const PACING = {
  /** How long each card stays pinned while its chapter scrubs: the floor, and the ceiling however many legs it draws. */
  minScroll: 1,
  /** Scroll every leg-drawing chapter starts from, before its legs add theirs. */
  base: 0.6,
  maxScroll: 7,
  /** Screens of scroll per leg drawn. */
  perLeg: 0.012,
  /**
   * Big chapters slow down further: each leg costs perLeg × (1 + legs / slowAfter), so a 50-leg chapter gets about
   * 1.1× the scroll per leg and a 300-leg one 1.5×. Lower it to stretch big chapters more.
   */
  slowAfter: 600,
  /** The opening card: how long it holds before the first chapter's card comes up. 0 = scrolling moves it at once. */
  opening: 0,
  /** Asides that hold the lines where they are (joyrides, airframes, later lives, gone, all). */
  hold: 1,
  /** The skydive: its footage scrubs over this much scroll. */
  jump: 3.5,
  /**
   * The distance section. Each runs on a curve rather than evenly: the first lap and the first Moon trip get a full,
   * slow stroke of their own (about 0.9 and 3.5 screens), then the rest wind on faster and faster, so a flick can't
   * pass them before they've been seen, and the sheer count still shows (Nik: both were far too easy to skip).
   */
  laps: 5,
  moon: 6,
  /** The distance curve: done = progress ^ windUp. 1 = even; 2.5 gives unit k its start at k^0.4 of the way. */
  windUp: 2.5,
  /** How tightly the drawing, footage and distance line follow the scroll, per second: lower is smoother and laggier. */
  follow: 5,
  /** Camera damping, per second: lower is a slower, floatier move (camera-spec.md: 2.6). */
  camera: 2,
  /** The Moon chapter's camera, which runs on its own clock: seconds to swing square-on to the Earth–Moon line, and to
   * pull back until both are on screen at true scale (they were 2.5 and 6). */
  moonSwing: 1.2,
  moonZoom: 2.5,
  /** How fast the camera turns into the direction of travel, per second. */
  yaw: 0.8,
  /** Debouncing: a new chapter's shot closer than this (degrees, and log-zoom) to the current one doesn't move the camera. */
  minMoveDeg: 4,
  minZoom: 0.15,
  /** Debouncing: the travel heading changes only by more than this (radians), held this long (seconds). */
  minYaw: 0.2,
  yawHold: 1.2,
  /** Highlight fades, per second (4 = about a second). */
  highlight: 2.5,
  /** Airport puddles on every takeoff and landing, in real seconds: how long one spreads, and the shortest gap before
   * the same airport puddles again (busy hubs pulse instead of strobing). */
  puddle: 1.8,
  puddleGap: 0.5,
  /** A fast scrub puddles only its last this-many takeoff/landing instants; a jump of more legs than puddleSkip in one
   * frame is a cut and makes none. */
  puddleBurst: 24,
  puddleSkip: 80,
} as const

/** Screens of scroll a chapter runs over. */
export function scrollOf(ch: Chapter) {
  // The opening draws nothing, so holding it only made the first scroll feel dead (Nik).
  if (ch.id === 'opening') return PACING.opening
  if (ch.jump) return PACING.jump
  if (ch.scene) return PACING[ch.scene]
  if (!ch.range || ch.hold) return PACING.hold
  const legs = ch.range[1] - ch.range[0] + 1
  const screens = PACING.base + PACING.perLeg * legs * (1 + legs / PACING.slowAfter)
  return Math.min(PACING.maxScroll, Math.max(PACING.minScroll, screens))
}
