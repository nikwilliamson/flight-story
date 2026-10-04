import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Color, Object3D, type InstancedMesh } from 'three'
import { airports, legs } from '../data'
import { fmt } from '../data/facts'
import { CHAPTERS } from '../story/chapters'
import type { Plan } from '../story/scrollPlan'
import { scroll } from '../story/scrollState'
import { Label } from './Label'
import { fonts } from './fonts'
import { ui } from './tokens'

/** Room kept clear above and below the rail, px. */
const MARGIN = 60
/** Closest two keys may sit, px: flights closer than this share a key. */
const PITCH = 3
/** Key lengths, px: a flight, a scroll item (asides, the jump, the distance chapters), and the swell at the playhead. */
const FLIGHT = 7
const ITEM = 14
const SWELL = 12
/** How far the swell reaches either side of the playhead, px. */
const REACH = 22
const MAX_KEYS = 600

interface Key {
  /** Scroll position this key stands for: where its flight draws, or where its item starts. */
  at: number
  chapter: number
  /** First leg index on the key, or -1 for a scroll item. */
  leg: number
  /** Leg indices sharing the key. */
  count: number
  intl: boolean
}

/**
 * Lays the story's scroll out as keys: one per flight (shared where flights are closer than PITCH) at the scroll
 * position that draws it, and one per scroll item that draws no flights.
 */
function keysFor(plan: Plan, span: number): Key[] {
  const toY = (s: number) => (s / Math.max(1, plan.length)) * span
  const keys: Key[] = []
  plan.segments.forEach((seg, i) => {
    const ch = CHAPTERS[i]
    if (!ch.range || ch.hold) {
      keys.push({ at: seg.at, chapter: i, leg: -1, count: 0, intl: false })
      return
    }
    const [a, b] = ch.range
    const n = b - a + 1
    let row = -Infinity
    for (let k = 0; k < n; k++) {
      const at = seg.at + ((k + 0.5) / n) * (seg.until - seg.at)
      const y = toY(at)
      const leg = a - 1 + k
      const last = keys.at(-1)
      if (last && last.leg >= 0 && last.chapter === i && y - row < PITCH) {
        last.count++
        last.intl ||= !!legs[leg].intl
        continue
      }
      row = y
      keys.push({ at, chapter: i, leg, count: 1, intl: !!legs[leg].intl })
    }
  })
  return keys.slice(0, MAX_KEYS)
}

const dummy = new Object3D()
const colour = new Color()

/**
 * The scroll as piano keys down the right edge: a key per flight, lit in its route colour once the scroll has drawn
 * it, and a longer key per scroll item. Keys swell around the playhead. Hover names the key; click scrolls there.
 */
export function Rail({ width, height, phone }: { width: number; height: number; phone: boolean }) {
  const mesh = useRef<InstancedMesh>(null)
  const [hover, setHover] = useState<{ key: Key; y: number } | null>(null)
  const top = phone ? 96 : MARGIN
  const span = height - top - (phone ? 72 : MARGIN)
  const right = width - (phone ? 4 : 14)
  const scale = phone ? 0.6 : 1
  const state = useRef({ plan: null as Plan | null, keys: [] as Key[], span: 0, swell: 0 }).current

  /** Phones have no hover, and a hit strip there would steal the scroll's touches. */
  const hitWidth = phone ? 0 : 40

  useFrame((_, delta) => {
    const m = mesh.current
    const plan = scroll.plan
    if (!m || !plan) return
    if (plan !== state.plan || span !== state.span) {
      state.plan = plan
      state.span = span
      state.keys = keysFor(plan, span)
    }
    const y = window.scrollY
    const head = (y / Math.max(1, plan.length)) * span
    // The swell eases in on load so the rail doesn't arrive already bulging.
    state.swell = Math.min(1, state.swell + delta)
    state.keys.forEach((k, i) => {
      const ky = (k.at / Math.max(1, plan.length)) * span
      const near = Math.exp(-(((ky - head) / REACH) ** 2)) * state.swell
      const base = k.leg < 0 ? ITEM : FLIGHT
      const length = (base + SWELL * near) * scale
      dummy.position.set(right - length / 2, -(top + ky), 2)
      dummy.scale.set(length, k.leg < 0 ? 1.5 : 1, 1)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      const drawn = k.at <= y + 1
      if (k.leg < 0) colour.copy(drawn ? ui.ink : ui.inkFaint)
      else if (drawn) colour.copy(k.intl ? ui.international : ui.domestic)
      else colour.copy(ui.inkFaint)
      if (!drawn) colour.multiplyScalar(0.8 + 0.5 * near)
      m.setColorAt(i, colour)
    })
    m.count = state.keys.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  const keyAt = (py: number) => {
    const plan = scroll.plan
    if (!plan || !state.keys.length) return null
    const s = ((py - top) / span) * plan.length
    let best = state.keys[0]
    for (const k of state.keys) if (Math.abs(k.at - s) < Math.abs(best.at - s)) best = k
    return { key: best, y: top + (best.at / plan.length) * span }
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

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, MAX_KEYS]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial transparent depthTest={false} depthWrite={false} />
      </instancedMesh>
      {hitWidth > 0 && (
        <mesh position={[right - hitWidth / 2, -(top + span / 2), 1]} onPointerMove={move} onPointerOut={leave} onClick={click}>
          <planeGeometry args={[hitWidth, span + 16]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
      {hover && (
        <Label x={right - FLIGHT - SWELL - 10} y={hover.y - 7} size={11} color={ui.ink} font={fonts.mono} align="right" nowrap>
          {labelFor(hover.key)}
        </Label>
      )}
    </group>
  )
}

function labelFor(k: Key) {
  const ch = CHAPTERS[k.chapter]
  if (k.leg < 0) return ch.title
  const l = legs[k.leg]
  const route = `${airports[l.from]?.code ?? '?'}–${airports[l.to]?.code ?? '?'}`
  const legNo = k.count > 1 ? `Legs ${fmt(k.leg + 1)}–${fmt(k.leg + k.count)}` : `Leg ${fmt(k.leg + 1)}`
  return `${legNo} · ${l.sort.slice(0, 4)}${k.count > 1 ? '' : ` · ${route}`}`
}
