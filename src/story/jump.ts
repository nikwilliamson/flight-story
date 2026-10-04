/**
 * The jump chapter's clock (wireframe JUMP). Over the chapter's scroll: 0–IN the footage fades in, IN–CABIN rides up
 * in the cabin, CABIN–DOOR the door opens and the sky light swells, then the layer fades and a line drops him onto
 * the drop zone.
 */
export const JUMP = {
  IN: 0.08,
  CABIN: 0.84,
  DOOR: 0.94,
  /** Seconds into the clip where the door opens. */
  CABIN_T: 15.4,
  DURATION: 16.5,
  /** Layer opacity in the cabin, and at the open door. */
  LOW: 0.16,
  HIGH: 0.38,
  /** public/jump-atlas.jpg: FRAMES frames sampled evenly over DURATION, COLS across (scripts/build_jump_atlas.sh). */
  FRAMES: 128,
  COLS: 8,
  ROWS: 16,
}

/** Eased chapter progress, written by the scroll driver: 0 before the jump, 1 after it. */
export const jump = { progress: 0 }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const ease = (t: number) => t * t * (3 - 2 * t)

export function jumpPhase(p: number) {
  const open = ease(clamp01(p / JUMP.IN))
  const door = ease(clamp01((p - JUMP.CABIN) / (JUMP.DOOR - JUMP.CABIN)))
  const out = clamp01((p - JUMP.DOOR) / (1 - JUMP.DOOR))
  const seconds = p < JUMP.CABIN ? clamp01((p - JUMP.IN) / (JUMP.CABIN - JUMP.IN)) * JUMP.CABIN_T : JUMP.CABIN_T + door * (JUMP.DURATION - 0.05 - JUMP.CABIN_T)
  return {
    opacity: open * (JUMP.LOW + (JUMP.HIGH - JUMP.LOW) * door) * (1 - out),
    door,
    /** Fractional atlas frame. */
    frame: Math.min(JUMP.FRAMES - 1, (seconds / JUMP.DURATION) * JUMP.FRAMES),
    /** 0–1: the white line falling onto the drop zone. */
    drop: out <= 0.4 ? 0 : ease((out - 0.4) / 0.6),
  }
}
