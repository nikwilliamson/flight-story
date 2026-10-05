import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, type Group } from 'three'
import { airports, legs } from '../data'
import { fmt } from '../data/facts'
import { atEnd, select } from '../explore/explore'
import { AIRPORT_ROWS } from '../explore/lists'
import { latLonToVec3 } from '../geo'
import { view } from '../scene/camera/StoryCamera'
import { useStory } from '../state/store'
import { Glass } from './Glass'
import { Label } from './Label'
import { pointer } from './kit'
import type { Layout } from './layout'
import { space, type, ui } from './tokens'

/** Most airports named at once while a set is lit (the busiest in it); none on phones, where the globe is small. */
const NAMED = { desktop: 10, phone: 0 }
/** How close the pointer must come to an airport to pick it, px. */
const PICK_PX = 14
/** A press that moves further than this is a drag (spinning the globe), not a click, px. */
const CLICK_PX = 5

const ground = airports.map((a) => latLonToVec3(a.lat, a.lon, 1.003))
const projected = new Vector3()
const toEye = new Vector3()

/** Where airport a lands on screen in px, or null when it's round the back of the globe. */
function screenOf(a: number, width: number, height: number) {
  const cam = view.camera
  if (!cam) return null
  const p = ground[a]
  if (p.dot(toEye.copy(cam.position).sub(p)) <= 0) return null
  projected.copy(p).project(cam)
  return { x: ((projected.x + 1) / 2) * width, y: ((1 - projected.y) / 2) * height }
}

/** The lit set's busiest airports, most legs first. */
function busiest(set: readonly number[], n: number) {
  const counts = new Map<number, number>()
  for (const i of set) for (const a of [legs[i].from, legs[i].to]) if (a >= 0) counts.set(a, (counts.get(a) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n).map(([a]) => a)
}

/**
 * After the story, the globe answers back: the selection's busiest airports are named where they sit, and pointing at
 * any airport names it (code, city, legs) and lights its flights; clicking it selects it like its row in Airports.
 */
export function GlobeLabels({ layout }: { layout: Layout }) {
  const { width, height } = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const selection = useStory((s) => s.selection)
  const tab = useStory((s) => s.tab)
  const named = useMemo(() => (selection && tab ? busiest(selection.legs, layout.phone ? NAMED.phone : NAMED.desktop) : []), [selection, tab, layout.phone])
  const marks = useRef<(Group | null)[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const tip = useRef<Group>(null)
  const pickedRef = useRef<number | null>(null)

  // Picking: nearest airport to the pointer on the stage, while a tab is open and the globe is the reader's.
  useEffect(() => {
    const el = gl.domElement
    let press: { x: number; y: number } | null = null
    const pick = (e: PointerEvent) => {
      const { tab, interactive } = useStory.getState()
      const stage = layout.stage
      const inStage = e.clientX >= stage.x && e.clientX <= stage.x + stage.width && e.clientY >= stage.y && e.clientY <= stage.y + stage.height
      if (!tab || !interactive || !atEnd() || !inStage || e.pointerType === 'touch') return null
      let best: number | null = null
      let bestD = PICK_PX
      for (const a of AIRPORT_ROWS.keys()) {
        const p = screenOf(a, width, height)
        if (!p) continue
        const d = Math.hypot(p.x - e.clientX, p.y - e.clientY)
        if (d < bestD) [best, bestD] = [a, d]
      }
      return best
    }
    const set = (a: number | null) => {
      if (a === pickedRef.current) return
      const was = pickedRef.current
      pickedRef.current = a
      setPicked(a)
      pointer(a !== null)
      const store = useStory.getState()
      if (a !== null) store.setHover(AIRPORT_ROWS.get(a)!.legs)
      else if (was !== null) store.setHover(null)
    }
    const move = (e: PointerEvent) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_PX) press = null
      set(e.buttons ? null : pick(e))
    }
    const down = (e: PointerEvent) => void (press = { x: e.clientX, y: e.clientY })
    const up = (e: PointerEvent) => {
      if (!press) return
      press = null
      const a = pick(e)
      if (a === null) return
      set(null)
      select(AIRPORT_ROWS.get(a)!)
    }
    const leave = () => set(null)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointerleave', leave)
    }
  }, [gl, layout, width, height])

  useFrame(() => {
    const live = atEnd() && !useStory.getState().sheet
    named.forEach((a, i) => {
      const g = marks.current[i]
      if (!g) return
      const p = live ? screenOf(a, width, height) : null
      const s = layout.stage
      g.visible = !!p && p.x > s.x && p.x < s.x + s.width && p.y > s.y && p.y < s.y + s.height && a !== pickedRef.current
      if (p) g.position.set(p.x, -p.y, 0)
    })
    const t = tip.current
    if (!t) return
    const p = pickedRef.current !== null ? screenOf(pickedRef.current, width, height) : null
    t.visible = !!p
    if (p) t.position.set(p.x, -p.y, 0)
  })

  const s = layout.scale
  const label = type.monoLabel.size * type.monoLabel.line * s
  const row = picked !== null ? AIRPORT_ROWS.get(picked) : undefined
  return (
    <>
      {named.map((a, i) => (
        <group key={a} ref={(g) => void (marks.current[i] = g)} visible={false}>
          <Label x={space.s * s} y={-label / 2} role="monoLabel" s={s} color={ui.ink}>
            {airports[a].code}
          </Label>
        </group>
      ))}
      <group ref={tip} visible={false}>
        {row && picked !== null && <Tooltip code={airports[picked].code} city={airports[picked].city} count={`${fmt(row.count)} legs`} s={s} />}
      </group>
    </>
  )
}

function Tooltip({ code, city, count, s }: { code: string; city: string; count: string; s: number }) {
  const pad = space.s * s
  const head = type.displayS.size * type.displayS.line * s
  const sub = type.monoData.size * type.monoData.line * s
  const w = 200 * s
  const h = pad * 2 + head + sub
  const x = space.m * s
  const y = -h - space.s * s
  return (
    <group>
      <Glass x={x} y={y} width={w} height={h} radius={space.s * s} />
      <Label x={x + pad} y={y + pad} role="displayS" s={s} color={ui.ink} width={w - 2 * pad} nowrap>
        {`${code} · ${city}`}
      </Label>
      <Label x={x + pad} y={y + pad + head} role="monoData" s={s} color={ui.inkDim}>
        {count}
      </Label>
    </group>
  )
}
