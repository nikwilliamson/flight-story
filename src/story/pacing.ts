/**
 * Every timing knob in the story, in one place to tune by hand. Seconds unless noted. `npm run dev` hot-reloads
 * this file, and `#ch=<chapter id>` jumps straight to a chapter to replay it.
 */
export const PACING = {
  /** Every chapter's playback: the floor, and the ceiling however many legs it draws. */
  minChapter: 6,
  maxChapter: 60,
  /** Seconds per leg drawn. 0.08 is half the speed of the first build (Nik). */
  perLeg: 0.08,
  /**
   * Big chapters slow down further: each leg costs perLeg × (1 + legs / slowAfter), so a 50-leg chapter runs about
   * 1.2× as long per leg and a 300-leg one 2×. Raise it to treat big chapters more like small ones.
   */
  slowAfter: 300,
  /** Asides that hold the lines where they are (joyrides, airframes, later lives, gone, all). */
  hold: 4,
  /** The skydive. The footage runs in real time between fade-in and the door, so this sets its speed too (19 = 1×). */
  jump: 19,
  /** The distance section, which holds the page until it finishes (see pinDistance). */
  laps: 28,
  moon: 52,
  /** The page won't scroll on past the laps and Moon chapters until they've played out (scrolling back still works). */
  pinDistance: true,
  /** Beat between the camera arriving and the chapter starting to play (Nik's buffer rule). */
  lineDelay: 0.5,
  /** Camera damping, per second: lower is a slower, floatier move (camera-spec.md: 2.6). */
  camera: 1.6,
  /** How fast the camera turns into the direction of travel, per second. */
  yaw: 0.8,
  /** Highlight fades, per second (4 = about a second). */
  highlight: 2.5,
} as const

/** Seconds a chapter of `legs` legs plays for. */
export function playFor(legs: number) {
  const seconds = PACING.perLeg * legs * (1 + legs / PACING.slowAfter)
  return Math.min(PACING.maxChapter, Math.max(PACING.minChapter, seconds))
}
