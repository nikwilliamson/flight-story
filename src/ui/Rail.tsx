import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Color, InstancedBufferAttribute, InstancedBufferGeometry, NormalBlending, PlaneGeometry, ShaderMaterial } from 'three'
import { airports, legs } from '../data'
import { fmt } from '../data/facts'
import { ease } from '../motion'
import { CHAPTERS } from '../story/chapters'
import { distance, LAPS, MOON_TRIPS } from '../story/distance'
import type { Plan } from '../story/scrollPlan'
import { scroll, scrollTop, scrollToY } from '../story/scrollState'
import { Label } from './Label'
import { pointer } from './kit'
import { ui } from './tokens'

/** Keys run this far past the screen's edge so their round ends are cut off and they sit flush with it, px. */
const OVERHANG = 2
/** Distance between keys, px: the rail holds as many as fit the screen's height. */
const STEP = 4.5
/** Key length, px, and the extra swell at the playhead. */
const KEY = 9
const SWELL = 14
/** How far the swell reaches either side of the playhead, px. */
const REACH = 26
/** Key thickness, px. */
const THICK = 1.6
/** How fast keys ease to their size and the rails swap, per second. */
const KEY_RATE = 12
const SWAP_RATE = 2.2
/** How much of the swap the ripple from the playhead takes up: 0 swaps every key at once. */
const RIPPLE = 0.7
/** How far a key slides out to the right as its rail swaps away, px. */
const SLIDE = 22
/** Soft glow drawn round lit keys near the playhead, px. */
const HALO = 5
/** Each Moon key is this much of a round trip. */
const MOON_KEY = 0.1
const MAX = 1600

/** How far the rail reaches in from the right edge at full swell, glow included, px (before the phone scale). */
export const RAIL_REACH = KEY + SWELL + 8 + HALO + 2
/** The rail's size on phones. */
export const RAIL_PHONE_SCALE = 0.65

type Track = 'story' | 'laps' | 'moon'
const TRACKS: Track[] = ['story', 'laps', 'moon']

interface Key {
  /** The stretch of scroll the key stands for. */
  at: number
  until: number
  chapter: number
  /** Story keys in a flight chapter: the legs drawn over the key's stretch, [first, last] (indices), else null. */
  legs: [number, number] | null
  /** Event keys: their number, from 0. */
  n: number
}

/**
 * Evenly spaced keys for the story rail, all alike, with no gaps. The chapters share them in proportion to their
 * scroll, so a long chapter takes up more of the rail; each key stands for a slice of its chapter's scroll and, in
 * the chapters that draw flights, the legs drawn over that slice.
 */
function storyKeys(plan: Plan, count: number): Key[] {
  const lengths = plan.segments.map((s) => Math.max(1, s.until - s.at))
  const total = lengths.reduce((a, b) => a + b, 0)
  const keys: Key[] = []
  plan.segments.forEach((seg, i) => {
    const ch = CHAPTERS[i]
    const n = Math.max(1, Math.round((count * lengths[i]) / total))
    const flights = ch.range && !ch.hold ? ch.range : null
    for (let j = 0; j < n; j++) {
      let drawn: [number, number] | null = null
      if (flights) {
        const legsIn = flights[1] - flights[0] + 1
        const a = Math.floor((j / n) * legsIn)
        const b = Math.max(a, Math.ceil(((j + 1) / n) * legsIn) - 1)
        drawn = [flights[0] - 1 + a, flights[0] - 1 + b]
      }
      keys.push({ at: seg.at + (j / n) * lengths[i], until: seg.at + ((j + 1) / n) * lengths[i], chapter: i, legs: drawn, n: j })
    }
  })
  return keys
}

/** An event chapter's own rail: a key per lap of the Earth, or per tenth of a Moon round trip. */
function eventKeys(plan: Plan, track: 'laps' | 'moon'): Key[] {
  const chapter = CHAPTERS.findIndex((c) => c.scene === track)
  const seg = plan.segments[chapter]
  if (!seg) return []
  const total = track === 'laps' ? LAPS : MOON_TRIPS / MOON_KEY
  return Array.from({ length: Math.ceil(total) }, (_, i) => ({
    at: seg.at + (i / total) * (seg.until - seg.at),
    until: seg.at + (Math.min(total, i + 1) / total) * (seg.until - seg.at),
    chapter,
    legs: null,
    n: i,
  }))
}

/** How many of a rail's keys the scroll has passed, fractional: where the playhead sits along it. */
function passed(t: Track, keys: Key[], y: number) {
  if (t === 'laps') return distance.laps * LAPS
  if (t === 'moon') return (distance.moon * MOON_TRIPS) / MOON_KEY
  let count = 0
  for (const k of keys) {
    if (y >= k.until) count++
    else {
      if (y > k.at) count += (y - k.at) / (k.until - k.at)
      break
    }
  }
  return count
}

const vertexShader = /* glsl */ `
  attribute vec2 aOffset;
  attribute vec2 aSize;
  attribute vec4 aColor;
  attribute float aSoft;
  varying vec2 vP;
  varying vec2 vHalf;
  varying vec4 vColor;
  varying float vSoft;
  void main() {
    vHalf = aSize * 0.5;
    vSoft = aSoft;
    vColor = aColor;
    // Grow the quad by the halo (and a pixel for the anti-aliased edge) so the soft falloff isn't clipped.
    vP = position.xy * 2.0 * (vHalf + vec2(aSoft + 1.0));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(aOffset + vP, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  varying vec2 vP;
  varying vec2 vHalf;
  varying vec4 vColor;
  varying float vSoft;
  void main() {
    // A capsule: a rounded box whose radius is half its short side, so keys have round ends.
    float r = min(vHalf.x, vHalf.y);
    vec2 q = abs(vP) - vHalf + r;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    float a = vSoft > 0.0 ? exp(-max(d, 0.0) * 3.0 / vSoft) : 1.0 - smoothstep(-0.5, 0.5, d);
    a *= vColor.a;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor.rgb * a, a);
  }
`

const colour = new Color()

/**
 * The scroll as piano keys down the right edge, flush with the screen, top to bottom: evenly spaced white keys, all
 * alike, lit as the scroll passes them. Chapters share the keys in proportion to their scroll. In the Earth laps and
 * the Moon trips the rail swaps, rippling out from the playhead, for that chapter's own keys over the whole height:
 * a key per lap, a key per tenth of a round trip. Keys swell and glow round the playhead and round the pointer. Hover names a key; click
 * scrolls there.
 */
export function Rail({ width, height, phone }: { width: number; height: number; phone: boolean }) {
  const [hover, setHover] = useState<{ key: Key; track: Track; y: number } | null>(null)
  const [counter, setCounter] = useState<{ text: string; y: number } | null>(null)
  // Flush with the viewport: the right edge, top to bottom (a hair in, so the end keys aren't half cut).
  const top = 1
  const span = height - 2
  const right = width + OVERHANG
  const scale = phone ? RAIL_PHONE_SCALE : 1
  const state = useRef({
    plan: null as Plan | null,
    span: 0,
    tracks: { story: [], laps: [], moon: [] } as Record<Track, Key[]>,
    /** Each rail's visibility, 0–1, and each key's eased swell, by track. */
    shown: { story: 1, laps: 0, moon: 0 } as Record<Track, number>,
    swell: { story: new Float32Array(0), laps: new Float32Array(0), moon: new Float32Array(0) } as Record<Track, Float32Array>,
    head: 0,
    /** Where the pointer is on the rail, px down it, or null: keys swell round it as round the playhead. */
    pointer: null as number | null,
    counter: '',
    counterY: 0,
  }).current

  const { geometry, material, attrs } = useMemo(() => {
    const plane = new PlaneGeometry(1, 1)
    const g = new InstancedBufferGeometry()
    g.index = plane.index
    g.setAttribute('position', plane.getAttribute('position'))
    const attrs = {
      offset: new InstancedBufferAttribute(new Float32Array(MAX * 2), 2),
      size: new InstancedBufferAttribute(new Float32Array(MAX * 2), 2),
      color: new InstancedBufferAttribute(new Float32Array(MAX * 4), 4),
      soft: new InstancedBufferAttribute(new Float32Array(MAX), 1),
    }
    g.setAttribute('aOffset', attrs.offset)
    g.setAttribute('aSize', attrs.size)
    g.setAttribute('aColor', attrs.color)
    g.setAttribute('aSoft', attrs.soft)
    g.instanceCount = 0
    const m = new ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false, blending: NormalBlending, premultipliedAlpha: true })
    return { geometry: g, material: m, attrs }
  }, [])

  /** Where key i of a rail of n sits, px down the rail. */
  const slot = (i: number, n: number) => ((i + 0.5) / Math.max(1, n)) * span

  useFrame((_, delta) => {
    const plan = scroll.plan
    if (!plan) return
    const dt = Math.min(delta, 0.1)
    if (plan !== state.plan || span !== state.span) {
      state.plan = plan
      state.span = span
      state.tracks = { story: storyKeys(plan, Math.floor(span / STEP)), laps: eventKeys(plan, 'laps'), moon: eventKeys(plan, 'moon') }
      for (const t of TRACKS) state.swell[t] = new Float32Array(state.tracks[t].length)
    }
    const y = scrollTop()
    const active = trackNow()
    let n = 0
    const put = (x: number, cy: number, w: number, h: number, c: Color, alpha: number, soft = 0) => {
      if (n >= MAX || alpha < 0.004 || w < 0.05 || h < 0.05) return
      attrs.offset.setXY(n, x, -(top + cy))
      attrs.size.setXY(n, w, h)
      attrs.color.setXYZW(n, c.r, c.g, c.b, alpha)
      attrs.soft.setX(n, soft)
      n++
    }
    const headOf = (t: Track) => {
      const keys = state.tracks[t]
      return (passed(t, keys, y) / Math.max(1, keys.length)) * span
    }
    state.head += (headOf(active) - state.head) * ease(dt, KEY_RATE)

    for (const t of TRACKS) {
      state.shown[t] += ((t === active ? 1 : 0) - state.shown[t]) * ease(dt, SWAP_RATE)
      const shown = state.shown[t]
      if (shown < 0.002) continue
      const keys = state.tracks[t]
      const swell = state.swell[t]
      const head = t === active ? state.head : headOf(t)
      const lit = passed(t, keys, y)

      keys.forEach((_, i) => {
        const ky = slot(i, keys.length)
        const atHead = Math.exp(-(((ky - head) / REACH) ** 2))
        const atPointer = state.pointer === null || t !== active ? 0 : Math.exp(-(((ky - state.pointer) / REACH) ** 2))
        swell[i] += (Math.max(atHead, atPointer) - swell[i]) * ease(dt, KEY_RATE)
        const s = swell[i]
        // The swap ripples out from the playhead: keys near it leave first and arrive first, sliding as they go.
        const order = Math.min(1, Math.abs(ky - head) / span)
        const v = Math.min(1, Math.max(0, shown * (1 + RIPPLE) - order * RIPPLE))
        const alpha = v * v * (3 - 2 * v)
        const edge = right + (1 - alpha) * SLIDE
        const w = (KEY + SWELL * s) * scale
        const h = THICK * (1 + 0.35 * s)
        // Lit once passed; the key under the playhead fills from the edge as the scroll crosses it.
        const fill = Math.min(1, Math.max(0, lit - i))
        if (fill < 1) put(edge - w / 2, ky, w, h, colour.copy(ui.inkDim), alpha * (0.4 + 0.4 * s))
        if (fill > 0) {
          put(edge - (w * fill) / 2, ky, w * fill, h, colour.copy(ui.ink), alpha * (0.75 + 0.25 * s))
          if (s > 0.05) put(edge - (w * fill) / 2, ky, w * fill, h, colour, alpha * s * 0.45, HALO)
        }
      })
    }

    // The playhead: one key longer and brighter than the rest, glowing.
    const pw = (KEY + SWELL + 8) * scale
    put(right - pw / 2, state.head, pw, 2, colour.copy(ui.ink), 1)
    put(right - pw / 2, state.head, pw, 2, colour, 0.45, HALO + 2)

    geometry.instanceCount = n
    for (const a of Object.values(attrs)) a.needsUpdate = true

    // The event rails count what they show beside the playhead: "LAP 23 OF 75", "TRIP 2 OF 3.9".
    let text = ''
    if (active === 'laps') text = `LAP ${Math.min(Math.ceil(LAPS), Math.floor(distance.laps * LAPS) + 1)} OF ${Math.round(LAPS)}`
    if (active === 'moon') text = `TRIP ${Math.min(Math.ceil(MOON_TRIPS), Math.floor(distance.moon * MOON_TRIPS) + 1)} OF ${fmt(MOON_TRIPS, 1)}`
    const cy = Math.round(state.head)
    if (text !== state.counter || (text && cy !== state.counterY)) {
      state.counter = text
      state.counterY = cy
      setCounter(text ? { text, y: cy } : null)
    }
  })

  const keyAt = (py: number) => {
    const track = trackNow()
    const keys = state.tracks[track]
    if (!keys.length) return null
    const i = Math.min(keys.length - 1, Math.max(0, Math.floor(((py - top) / span) * keys.length)))
    return { key: keys[i], track, y: top + slot(i, keys.length) }
  }
  const move = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    state.pointer = -e.point.y - top
    const found = keyAt(-e.point.y)
    setHover((h) => (h?.key === found?.key ? h : found))
    pointer(true)
  }
  const leave = () => {
    state.pointer = null
    setHover(null)
    pointer(false)
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const found = keyAt(-e.point.y)
    if (found) scrollToY(found.key.at + 1, true)
  }

  /** Phones have no hover, and a hit strip there would steal the scroll's touches. */
  const hitWidth = phone ? 0 : 48
  const labelX = width - (KEY + SWELL + 8) * scale - 10
  return (
    <group>
      <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={5} raycast={() => null} />
      {hitWidth > 0 && (
        <mesh position={[width - hitWidth / 2, -(top + span / 2), 1]} onPointerMove={move} onPointerOut={leave} onClick={click}>
          <planeGeometry args={[hitWidth, span]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
      {counter && !hover && (
        <Label x={labelX} y={top + counter.y - 7} role="monoLabel" s={phone ? 0.85 : 1} color={ui.ink} align="right" nowrap>
          {counter.text}
        </Label>
      )}
      {hover && (
        <Label x={labelX} y={hover.y - 7} role="monoData" color={ui.ink} align="right" nowrap>
          {labelFor(hover.key, hover.track)}
        </Label>
      )}
    </group>
  )
}

/** Which rail the reader is on: the distance chapters have their own. */
const trackNow = (): Track => CHAPTERS[scroll.active]?.scene ?? 'story'

function labelFor(k: Key, track: Track) {
  if (track === 'laps') return `Lap ${k.n + 1} around the Earth`
  if (track === 'moon') {
    const trip = k.n * MOON_KEY
    return `Trip ${Math.floor(trip) + 1} · ${trip % 1 < 0.5 ? 'out to the Moon' : 'back to Earth'}`
  }
  if (!k.legs) return CHAPTERS[k.chapter].title
  const [a, b] = k.legs
  const l = legs[a]
  if (a === b) return `Leg ${fmt(a + 1)} · ${l.sort.slice(0, 4)} · ${airports[l.from]?.code ?? '?'}–${airports[l.to]?.code ?? '?'}`
  const years = [l.sort.slice(0, 4), legs[b].sort.slice(0, 4)]
  return `Legs ${fmt(a + 1)}–${fmt(b + 1)} · ${years[0] === years[1] ? years[0] : years.join('–')}`
}
