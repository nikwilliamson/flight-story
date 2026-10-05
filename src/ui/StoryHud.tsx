import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { legs } from '../data'
import { fmt } from '../data/facts'
import { STORY_END, timeline } from '../story/timeline'
import { CHAPTERS } from '../story/chapters'
import { distance, LAPS, MOON_TRIPS } from '../story/distance'
import { scroll } from '../story/scrollState'
import type { Mesh } from 'three'
import type { Stage } from '../state/store'
import { Label } from './Label'
import { RAIL_PHONE_SCALE, RAIL_REACH } from './Rail'
import { space, type, ui } from './tokens'

const cumulative = new Float64Array(legs.length)
legs.forEach((l, i) => (cumulative[i] = (i ? cumulative[i - 1] : 0) + (l.miles ?? 0)))
const firstYear = legs[0].sort.slice(0, 4)
const lastYear = legs[legs.length - 1].sort.slice(0, 4)

function readout(time: number): { title: string; line: string } {
  // The distance section counts its own line: laps up, then Moon trips up while the laps still wound count down.
  const scene = CHAPTERS[scroll.active]?.scene
  if (scene === 'laps') return { title: `${fmt(distance.laps * LAPS, 1)} laps`, line: `of ${fmt(LAPS, 1)} around the Earth · ${fmt(distance.laps * total)} mi` }
  if (scene === 'moon') return { title: `${fmt(distance.moon * MOON_TRIPS, 1)} Moon trips`, line: `${fmt((1 - distance.moon) * LAPS, 1)} laps still wound · ${fmt(total)} mi` }
  if (time >= STORY_END) return { title: `${firstYear}–${lastYear}`, line: countLine(legs.length) }
  const count = Math.max(0, Math.min(legs.length, Math.floor(time + 0.5)))
  return { title: legs[Math.max(0, count - 1)].sort.slice(0, 4), line: countLine(count) }
}

const total = cumulative[legs.length - 1]
const countLine = (count: number) => `leg ${fmt(count)} of ${fmt(legs.length)} · ${fmt(count ? cumulative[count - 1] : 0)} mi`

/** The chapter progress line under the readout, px. */
const PROGRESS = 96
const noRaycast = () => null

/** Where the chapter progress line sits, px from the top. */
const progressAt = (stage: Stage, s: number) =>
  stage.y + space.l * s + type.displayL.size * type.displayL.line * s + space.xs * s + type.monoData.size * type.monoData.line * s + space.s * s

/** The readout's foot, progress line included: where anything stacked under it starts. */
export const hudBottom = (stage: Stage, s: number) => progressAt(stage, s) + space.l * s

/** Gap between the readout and the rail at full swell, px. */
const RAIL_GAP = space.l

/**
 * The year and running totals at the top right of the globe's stage, right-aligned and clear of the rail even when
 * its keys swell. Re-typesets only when a number changes.
 */
export function StoryHud({ stage, s, phone }: { stage: Stage; s: number; phone: boolean }) {
  const [state, setState] = useState(() => readout(timeline.time))
  const fill = useRef<Mesh>(null)
  const track = useRef<Mesh>(null)
  useFrame(() => {
    const next = readout(timeline.time)
    if (next.title !== state.title || next.line !== state.line) setState(next)
    // How far through the chapter the scroll is, growing from the right edge like the readout.
    const ch = CHAPTERS[scroll.active]
    const inChapter = !!ch && scroll.active > 0 && scroll.active < CHAPTERS.length - 1
    const p = inChapter ? scroll.progress : 0
    const f = fill.current
    if (!f || !track.current) return
    track.current.visible = inChapter
    f.visible = p > 0.001
    f.scale.x = Math.max(0.001, p)
    f.position.x = x - (PROGRESS * s * p) / 2
  })
  const x = stage.x + stage.width - RAIL_REACH * (phone ? RAIL_PHONE_SCALE : 1) - RAIL_GAP * s
  const y = stage.y + space.l * s
  const progressY = progressAt(stage, s)
  return (
    <group>
      <Label x={x} y={y} role="displayL" s={s} color={ui.ink} align="right">
        {state.title}
      </Label>
      <Label x={x} y={y + type.displayL.size * type.displayL.line * s + space.xs * s} role="monoData" s={s} color={ui.inkDim} align="right">
        {state.line}
      </Label>
      <mesh ref={track} position={[x - (PROGRESS * s) / 2, -progressY, 0]} raycast={noRaycast}>
        <planeGeometry args={[PROGRESS * s, 1]} />
        <meshBasicMaterial color={ui.inkFaint} transparent opacity={0.5} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={fill} position={[x, -progressY, 0.5]} raycast={noRaycast}>
        <planeGeometry args={[PROGRESS * s, 1.5]} />
        <meshBasicMaterial color={ui.ink} transparent opacity={0.8} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  )
}
