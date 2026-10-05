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
import { scroll } from '../story/scrollState'
import { Label } from './Label'
import { fonts } from './fonts'
import { ui } from './tokens'

/** Keys run this far past the screen's edge so their round ends are cut off and they sit flush with it, px. */
const OVERHANG = 2
/** Closest two flight keys may sit, px: flights closer than this share a key. */
const PITCH = 3
/** Key lengths, px: a flight, a scroll item, and the extra swell at the playhead. */
const FLIGHT = 7
const ITEM = 12
/** Blocks (asides, Moon trips) are slim bars this wide, plus BLOCK_SWELL at the playhead. */
const BLOCK = 3.5
const BLOCK_SWELL = 2.5
const SWELL = 14
/** How far the swell reaches either side of the playhead, px. */
const REACH = 26
/** Key thickness, px. */
const THICK = 1.6
/** A fun fact's key: longer than a flight's, so the facts stand out among them, px. */
const FACT = 13
/** How fast keys ease to their size and the rails swap, per second. */
const KEY_RATE = 12
const SWAP_RATE = 2.2
/** How much of the swap the ripple from the playhead takes up: 0 swaps every key at once. */
const RIPPLE = 0.7
/** How far a key slides out to the right as its rail swaps away, px. */
const SLIDE = 22
/** Soft glow drawn round lit keys near the playhead, px. */
const HALO = 5
const MAX = 2400

type Track = 'story' | 'laps' | 'moon'
const TRACKS: Track[] = ['story', 'laps', 'moon']

interface Key {
  kind: 'flight' | 'item' | 'fact' | 'lap' | 'trip'
  /** Scroll position this key stands for, and where it ends (items and event keys take up their scroll). */
  at: number
  until: number
  chapter: number
  /** Flight keys: first leg index and how many legs share the key. Event keys: their number, from 0. */
  leg: number
  count: number
  /** Event keys: how much of a whole lap or half-trip this key is (the last one is partial). */
  part: number
  text?: string
}

const key = (k: Partial<Key> & Pick<Key, 'kind' | 'at' | 'chapter'>): Key => ({ until: k.at, leg: -1, count: 0, part: 1, ...k })

/**
 * The story's scroll as keys: one per flight (shared where flights are closer than PITCH) where the scroll draws
 * it, one block per scroll item as tall as its scroll, and a longer key per fun fact spread through its chapter.
 */
function storyKeys(plan: Plan, span: number): Key[] {
  const toY = (s: number) => (s / Math.max(1, plan.length)) * span
  const keys: Key[] = []
  plan.segments.forEach((seg, i) => {
    const ch = CHAPTERS[i]
    if (!ch.range || ch.hold) {
      keys.push(key({ kind: 'item', at: seg.at, until: seg.until, chapter: i }))
    } else {
      const [a, b] = ch.range
      const n = b - a + 1
      let row = -Infinity
      for (let k = 0; k < n; k++) {
        const at = seg.at + ((k + 0.5) / n) * (seg.until - seg.at)
        const leg = a - 1 + k
        const last = keys.at(-1)
        if (last?.kind === 'flight' && last.chapter === i && toY(at) - row < PITCH) {
          last.count++
          continue
        }
        row = toY(at)
        keys.push(key({ kind: 'flight', at, chapter: i, leg, count: 1 }))
      }
    }
    const facts = ch.modules.flatMap((m) => (m.kind === 'fact' ? [m.text] : []))
    facts.forEach((text, j) => keys.push(key({ kind: 'fact', at: seg.at + ((j + 1) / (facts.length + 1)) * (seg.until - seg.at), chapter: i, text })))
  })
  return keys
}

/** An event chapter's own keys, filling the whole rail: one per lap of the Earth, or per leg of a Moon trip. */
function eventKeys(plan: Plan, track: 'laps' | 'moon'): Key[] {
  const chapter = CHAPTERS.findIndex((c) => c.scene === track)
  const seg = plan.segments[chapter]
  if (!seg) return []
  const total = track === 'laps' ? LAPS : MOON_TRIPS * 2
  return Array.from({ length: Math.ceil(total) }, (_, i) =>
    key({
      kind: track === 'laps' ? 'lap' : 'trip',
      at: seg.at + (i / total) * (seg.until - seg.at),
      until: seg.at + (Math.min(total, i + 1) / total) * (seg.until - seg.at),
      chapter,
      leg: i,
      part: Math.min(1, total - i),
    }),
  )
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
 * The scroll as piano keys down the right edge, laid out by scroll distance so each part takes the room its scroll
 * does. Through the story: a key per flight, lit once the scroll draws it; a block per aside,
 * the jump and the distance chapters, as tall as their scroll and filling as it runs, and a longer key per fun fact. In
 * the Earth laps and the Moon trips the rail swaps, rippling out from the playhead, for that chapter's own keys over
 * the whole height: a key per lap, a block per leg of each Moon trip. All white, flush with the screen's right edge. Keys swell and glow round the playhead. Hover
 * names a key; click scrolls there.
 */
export function Rail({ width, height, phone }: { width: number; height: number; phone: boolean }) {
  const [hover, setHover] = useState<{ key: Key; y: number } | null>(null)
  const [counter, setCounter] = useState<{ text: string; y: number } | null>(null)
  // Flush with the viewport: the right edge, top to bottom (a hair in, so the end keys aren't half cut).
  const top = 1
  const span = height - 2
  const right = width + OVERHANG
  const scale = phone ? 0.65 : 1
  const state = useRef({
    plan: null as Plan | null,
    span: 0,
    tracks: { story: [], laps: [], moon: [] } as Record<Track, Key[]>,
    /** Each rail's visibility, 0–1, and each key's eased swell, by track. */
    shown: { story: 1, laps: 0, moon: 0 } as Record<Track, number>,
    swell: { story: new Float32Array(0), laps: new Float32Array(0), moon: new Float32Array(0) } as Record<Track, Float32Array>,
    head: 0,
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

  useFrame((_, delta) => {
    const plan = scroll.plan
    if (!plan) return
    const dt = Math.min(delta, 0.1)
    if (plan !== state.plan || span !== state.span) {
      state.plan = plan
      state.span = span
      state.tracks = { story: storyKeys(plan, span), laps: eventKeys(plan, 'laps'), moon: eventKeys(plan, 'moon') }
      for (const t of TRACKS) state.swell[t] = new Float32Array(state.tracks[t].length)
    }
    const y = window.scrollY
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

    // The story rail spans the whole story's scroll; an event rail spans its own chapter's.
    const yOf = (t: Track, k: Key | undefined, at: number) => {
      if (t === 'story' || !k) return (at / Math.max(1, plan.length)) * span
      const seg = plan.segments[k.chapter]
      return ((at - seg.at) / Math.max(1, seg.until - seg.at)) * span
    }
    const headOf = (t: Track) => Math.min(span, Math.max(0, yOf(t, state.tracks[t][0], y)))
    state.head += (headOf(active) - state.head) * ease(dt, KEY_RATE)

    for (const t of TRACKS) {
      state.shown[t] += ((t === active ? 1 : 0) - state.shown[t]) * ease(dt, SWAP_RATE)
      const shown = state.shown[t]
      if (shown < 0.002) continue
      const keys = state.tracks[t]
      const swell = state.swell[t]
      const head = t === active ? state.head : headOf(t)
      const progress = t === 'laps' ? distance.laps * LAPS : t === 'moon' ? distance.moon * MOON_TRIPS * 2 : 0

      keys.forEach((k, i) => {
        const ky = yOf(t, k, k.at)
        const y1 = yOf(t, k, k.until)
        const near = Math.max(head > ky && head < y1 ? 1 : 0, Math.exp(-(((ky - head) / REACH) ** 2)), y1 > ky ? Math.exp(-(((y1 - head) / REACH) ** 2)) : 0)
        swell[i] += (near - swell[i]) * ease(dt, KEY_RATE)
        const s = swell[i]
        // The swap ripples out from the playhead: keys near it leave first and arrive first, sliding as they go.
        const order = Math.min(1, Math.abs(ky - head) / span)
        const v = Math.min(1, Math.max(0, shown * (1 + RIPPLE) - order * RIPPLE))
        const alpha = v * v * (3 - 2 * v)
        const edge = right + (1 - alpha) * SLIDE

        const block = k.kind === 'item' || k.kind === 'trip'
        if (block) {
          const w = (BLOCK + BLOCK_SWELL * s) * scale + OVERHANG
          // A block as tall as its scroll (less a gap between trips), filling top-down as it runs.
          const h = Math.max(THICK, y1 - ky - (k.kind === 'trip' ? 6 : 1))
          const fill = k.kind === 'trip' ? Math.min(1, Math.max(0, progress - k.leg) / k.part) : Math.min(1, Math.max(0, (y - k.at) / Math.max(1, k.until - k.at)))
          put(edge - w / 2, ky + h / 2, w, h, colour.copy(ui.inkFaint), alpha * 0.5)
          if (fill > 0) {
            put(edge - w / 2, ky + (h * fill) / 2, w, h * fill, colour.copy(ui.ink), alpha * 0.92)
            if (s > 0.05) put(edge - w / 2, ky + (h * fill) / 2, w, h * fill, colour, alpha * s * 0.3, HALO)
          }
          return
        }

        const w = ((k.kind === 'lap' ? ITEM - 2 : k.kind === 'fact' ? FACT : FLIGHT) + SWELL * s) * scale * (k.kind === 'lap' ? 0.4 + 0.6 * k.part : 1)
        // A key: lit once drawn (flights) or run (laps); the current lap fills from the edge.
        const h = THICK * (1 + 0.35 * s)
        const lit = k.kind === 'lap' ? Math.min(1, Math.max(0, progress - k.leg) / k.part) : k.at <= y + 1 ? 1 : 0
        if (lit < 1) put(edge - w / 2, ky, w, h, colour.copy(ui.inkDim), alpha * (0.4 + 0.4 * s))
        if (lit > 0) {
          colour.copy(ui.ink)
          put(edge - (w * lit) / 2, ky, w * lit, h, colour, alpha * (0.75 + 0.25 * s))
          if (s > 0.05) put(edge - (w * lit) / 2, ky, w * lit, h, colour, alpha * s * 0.45, HALO)
        }
      })
    }

    // The playhead: one key longer and brighter than the rest, glowing.
    const pw = (ITEM + SWELL + 6) * scale
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
    const plan = scroll.plan
    const t = trackNow()
    const keys = state.tracks[t]
    if (!plan || !keys.length) return null
    const toY = (k: Key, at: number) => {
      if (t === 'story') return top + (at / Math.max(1, plan.length)) * span
      const seg = plan.segments[k.chapter]
      return top + ((at - seg.at) / Math.max(1, seg.until - seg.at)) * span
    }
    // Blocks cover their whole scroll; otherwise the nearest key, facts winning near-ties so they can be hit among the flights.
    const inside = keys.find((k) => k.until > k.at && py >= toY(k, k.at) && py <= toY(k, k.until))
    if (inside) return { key: inside, y: toY(inside, inside.at) }
    const d = (k: Key) => Math.abs(toY(k, k.at) - py) - (k.kind === 'fact' ? PITCH : 0)
    let best = keys[0]
    for (const k of keys) if (d(k) < d(best)) best = k
    return { key: best, y: toY(best, best.at) }
  }
  const move = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const found = keyAt(-e.point.y)
    setHover((h) => (h?.key === found?.key ? h : found))
    document.body.style.cursor = 'pointer'
  }
  const leave = () => {
    setHover(null)
    document.body.style.cursor = ''
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const found = keyAt(-e.point.y)
    if (found) window.scrollTo({ top: found.key.at + 1, behavior: 'smooth' })
  }

  /** Phones have no hover, and a hit strip there would steal the scroll's touches. */
  const hitWidth = phone ? 0 : 48
  const labelX = width - (ITEM + SWELL + 6) * scale - 10
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
        <Label x={labelX} y={top + counter.y - 7} size={phone ? 9 : 10.5} color={ui.ink} font={fonts.mono} align="right" letterSpacing={0.08} nowrap>
          {counter.text}
        </Label>
      )}
      {hover && (
        <Label x={labelX} y={hover.y - 7} size={11} color={ui.ink} font={fonts.mono} align="right" nowrap>
          {labelFor(hover.key)}
        </Label>
      )}
    </group>
  )
}

/** Which rail the reader is on: the distance chapters have their own. */
const trackNow = (): Track => CHAPTERS[scroll.active]?.scene ?? 'story'

function labelFor(k: Key) {
  const ch = CHAPTERS[k.chapter]
  if (k.kind === 'fact') return k.text!.length > 64 ? `${k.text!.slice(0, 62).trimEnd()}…` : k.text!
  if (k.kind === 'item') return ch.title
  if (k.kind === 'lap') return k.part < 1 ? `Lap ${k.leg + 1}, the last ${Math.round(k.part * 100)}%` : `Lap ${k.leg + 1} round the Earth`
  if (k.kind === 'trip') return `Trip ${Math.floor(k.leg / 2) + 1} · ${k.leg % 2 ? 'back to Earth' : 'out to the Moon'}`
  const l = legs[k.leg]
  const route = `${airports[l.from]?.code ?? '?'}–${airports[l.to]?.code ?? '?'}`
  const legNo = k.count > 1 ? `Legs ${fmt(k.leg + 1)}–${fmt(k.leg + k.count)}` : `Leg ${fmt(k.leg + 1)}`
  return `${legNo} · ${l.sort.slice(0, 4)}${k.count > 1 ? '' : ` · ${route}`}`
}
