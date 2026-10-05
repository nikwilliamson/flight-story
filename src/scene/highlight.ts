import { DataTexture, NearestFilter, RedFormat, RGBAFormat, UnsignedByteType } from 'three'
import { airports, legs } from '../data'
import { useStory } from '../state/store'
import { PACING } from '../story/pacing'
import { ease, reducedMotion } from '../motion'

/** Highlight changes fade, never snap (Nik); the rate is in pacing.ts. */
const WIDTH = 256
/** How far unlit legs dim below the history look while anything is lit (wireframe uDim). */
export const DIM = 0.45
/** A hover is a preview: lit legs come up this far and the field dims this much; a click (or a chapter) commits. */
const PREVIEW_LIT = 0.6
const PREVIEW_DIM = 0.4
/**
 * Glow density cap (Nik: lighting the busiest things turned into a blob). Lines add up, so a route flown n times in the
 * lit set gets 1/n^ROUTE_FALLOFF of the strength each (n stacked lines then read n^(1-ROUTE_FALLOFF) times as bright as
 * one), and past CROWD distinct lit routes every line gives up a little more, never below FLOOR.
 */
const ROUTE_FALLOFF = 0.8
const CROWD = 30
const FLOOR = 0.2
/** A lit set comes up leg by leg in its own order: this long between legs, the whole cascade never longer than CASCADE. */
const STAGGER = 0.06
const CASCADE = 1.2

const height = Math.ceil(legs.length / WIDTH)
/** R: how lit (eased), G: that leg's share of the glow (density cap), B: its place in the set, 0–1 (the pulse's phase). */
const pixels = new Uint8Array(WIDTH * height * 4)
const current = new Float32Array(legs.length)
const target = new Float32Array(legs.length)
/** Seconds until each leg starts to come up (the cascade). */
const wait = new Float32Array(legs.length)
/** Per airport: how lit its brightest lit leg is right now. */
const airportPixels = new Uint8Array(WIDTH * Math.ceil(airports.length / WIDTH))

/**
 * Per-leg highlight amount, 0–1, as a WIDTH × height texture the arc shader samples by leg index. The CPU eases the
 * values; the GPU only reads them, so a hover costs one small texture upload and never touches geometry.
 */
export const highlight = {
  texture: Object.assign(new DataTexture(pixels, WIDTH, height, RGBAFormat, UnsignedByteType), {
    magFilter: NearestFilter,
    minFilter: NearestFilter,
  }),
  /** Per airport lit amount (R), sampled by airport index. */
  airports: Object.assign(new DataTexture(airportPixels, WIDTH, Math.ceil(airports.length / WIDTH), RedFormat, UnsignedByteType), {
    magFilter: NearestFilter,
    minFilter: NearestFilter,
  }),
  width: WIDTH,
  /** 0–1: how much the unlit legs are dimmed right now. */
  dim: 0,
  /** 0–1: how committed the lit set is (a click or a chapter, not a hover): the direction pulse rides on it. */
  commit: 0,
  /** Legs drawn in the lit pass (lit, or still fading out), and a version that changes when they do. */
  members: [] as number[],
  version: 0,
}

/** How lit leg index i is right now, 0–1 (eased). */
export const litAmount = (i: number) => current[i] ?? 0

const hasArc = (i: number) => !!legs[i] && legs[i].from !== legs[i].to

const routeOf = (i: number) => {
  const { from, to } = legs[i]
  return from < to ? `${from}-${to}` : `${to}-${from}`
}

/** Writes each lit leg's glow share into G and its place in the set into B. Unlit legs keep theirs, so a fade-out doesn't jump. */
function writeSet(set: readonly number[]) {
  const counts = new Map<string, number>()
  for (const i of set) if (legs[i]) counts.set(routeOf(i), (counts.get(routeOf(i)) ?? 0) + 1)
  const crowd = Math.min(1, Math.sqrt(CROWD / Math.max(1, counts.size)))
  const ordered = [...set].filter((i) => legs[i]).sort((a, b) => a - b)
  const step = Math.min(STAGGER, CASCADE / Math.max(1, ordered.length))
  ordered.forEach((i, rank) => {
    pixels[i * 4 + 1] = Math.round(Math.max(FLOOR, crowd * counts.get(routeOf(i))! ** -ROUTE_FALLOFF) * 255)
    pixels[i * 4 + 2] = Math.round((rank / Math.max(1, ordered.length)) * 255)
    // Already lit legs stay up; new ones queue in order.
    wait[i] = current[i] > 0 || reducedMotion() ? 0 : rank * step
  })
}

let applied: readonly number[] | null = null
let appliedPreview = false
let settling = false
let hasLine = false
const members = new Set<number>()

/** Eases every leg toward the store's highlight set. StoryTick calls it once per frame. */
export function stepHighlight(dt: number) {
  const { highlight: set, preview } = useStory.getState()
  if (set !== applied || preview !== appliedPreview) {
    target.fill(0)
    for (const i of set) target[i] = preview ? PREVIEW_LIT : 1
    writeSet(set)
    applied = set
    appliedPreview = preview
    // Only dim the field when something lit has a line of its own to stand out: same-field legs (joyrides, the
    // skydive) light as rings, and dimming every route around them just leaves an empty globe (Nik).
    hasLine = set.some(hasArc)
    settling = true
    let changed = false
    for (const i of set) if (!members.has(i)) (members.add(i), (changed = true))
    if (changed) publishMembers()
  }
  const dimTarget = hasLine ? (preview ? PREVIEW_DIM : 1) : 0
  const commitTarget = set.length && !preview ? 1 : 0
  const s = ease(dt, PACING.highlight)
  highlight.commit += (commitTarget - highlight.commit) * s
  if (!settling && highlight.dim === dimTarget) return
  let moving = false
  let dropped = false
  for (const i of members) {
    if (wait[i] > 0) {
      wait[i] -= dt
      moving = true
      continue
    }
    const gap = target[i] - current[i]
    if (gap === 0) continue
    current[i] = Math.abs(gap) < 0.004 ? target[i] : current[i] + gap * s
    pixels[i * 4] = Math.round(current[i] * 255)
    moving = true
    if (current[i] === 0 && target[i] === 0) (members.delete(i), (dropped = true))
  }
  if (dropped) publishMembers()
  const dimGap = dimTarget - highlight.dim
  highlight.dim = Math.abs(dimGap) < 0.004 ? dimTarget : highlight.dim + dimGap * s
  settling = moving
  if (moving) {
    highlight.texture.needsUpdate = true
    writeAirports()
  }
}

function publishMembers() {
  highlight.members = [...members].sort((a, b) => a - b)
  highlight.version++
}

/** Each airport takes the lit amount of its brightest lit leg. */
function writeAirports() {
  airportPixels.fill(0)
  for (const i of members) {
    const v = Math.round(current[i] * 255)
    for (const a of [legs[i].from, legs[i].to]) if (a >= 0 && v > airportPixels[a]) airportPixels[a] = v
  }
  highlight.airports.needsUpdate = true
}
