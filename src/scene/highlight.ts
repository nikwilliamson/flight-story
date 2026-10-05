import { DataTexture, NearestFilter, RGFormat, UnsignedByteType } from 'three'
import { legs } from '../data'
import { useStory } from '../state/store'
import { PACING } from '../story/pacing'
import { ease } from '../motion'

/** Highlight changes fade, never snap (Nik); the rate is in pacing.ts. */
const WIDTH = 256
/** How far unlit legs dim while anything is lit (wireframe uDim). */
export const DIM = 0.6
/**
 * Glow density cap (Nik: lighting the busiest things turned into a blob). Lines add up, so a route flown n times in the
 * lit set gets 1/n^ROUTE_FALLOFF of the strength each (n stacked lines then read n^(1-ROUTE_FALLOFF) times as bright as
 * one), and past CROWD distinct lit routes every line gives up a little more, never below FLOOR.
 */
const ROUTE_FALLOFF = 0.8
const CROWD = 30
const FLOOR = 0.2

const height = Math.ceil(legs.length / WIDTH)
/** R: how lit (eased), G: that leg's share of the glow (density cap). */
const pixels = new Uint8Array(WIDTH * height * 2)
const current = new Float32Array(legs.length)
const target = new Float32Array(legs.length)

/**
 * Per-leg highlight amount, 0–1, as a WIDTH × height texture the arc shader samples by leg index. The CPU eases the
 * values; the GPU only reads them, so a hover costs one small texture upload and never touches geometry.
 */
export const highlight = {
  texture: Object.assign(new DataTexture(pixels, WIDTH, height, RGFormat, UnsignedByteType), {
    magFilter: NearestFilter,
    minFilter: NearestFilter,
  }),
  width: WIDTH,
  /** 0–1: how much the unlit legs are dimmed right now. */
  dim: 0,
}

/** How lit leg index i is right now, 0–1 (eased). */
export const litAmount = (i: number) => current[i] ?? 0

const hasArc = (i: number) => !!legs[i] && legs[i].from !== legs[i].to

const routeOf = (i: number) => {
  const { from, to } = legs[i]
  return from < to ? `${from}-${to}` : `${to}-${from}`
}

/** Writes each lit leg's glow share into G. Unlit legs keep theirs, so a fade-out doesn't jump in brightness. */
function writeShares(set: readonly number[]) {
  const counts = new Map<string, number>()
  for (const i of set) if (legs[i]) counts.set(routeOf(i), (counts.get(routeOf(i)) ?? 0) + 1)
  const crowd = Math.min(1, Math.sqrt(CROWD / Math.max(1, counts.size)))
  for (const i of set) {
    if (!legs[i]) continue
    const share = Math.max(FLOOR, crowd * counts.get(routeOf(i))! ** -ROUTE_FALLOFF)
    pixels[i * 2 + 1] = Math.round(share * 255)
  }
}

let applied: readonly number[] | null = null
let settling = false

/** Eases every leg toward the store's highlight set. Call once per frame. */
export function stepHighlight(dt: number) {
  const set = useStory.getState().highlight
  if (set !== applied) {
    target.fill(0)
    for (const i of set) target[i] = 1
    writeShares(set)
    applied = set
    settling = true
  }
  // Only dim the field when something lit has a line of its own to stand out: same-field legs (joyrides, the
  // skydive) light as rings, and dimming every route around them just leaves an empty globe (Nik).
  const dimTarget = set.some(hasArc) ? 1 : 0
  if (!settling && highlight.dim === dimTarget) return
  const s = ease(dt, PACING.highlight)
  let moving = false
  for (let i = 0; i < current.length; i++) {
    const gap = target[i] - current[i]
    if (gap === 0) continue
    current[i] = Math.abs(gap) < 0.004 ? target[i] : current[i] + gap * s
    pixels[i * 2] = Math.round(current[i] * 255)
    moving = true
  }
  const dimGap = dimTarget - highlight.dim
  highlight.dim = Math.abs(dimGap) < 0.004 ? dimTarget : highlight.dim + dimGap * s
  settling = moving
  if (moving) highlight.texture.needsUpdate = true
}
