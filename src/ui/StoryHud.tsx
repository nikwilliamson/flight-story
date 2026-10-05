import { useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { legs } from '../data'
import { fmt } from '../data/facts'
import { STORY_END, timeline } from '../story/timeline'
import { CHAPTERS } from '../story/chapters'
import { distance, LAPS, MOON_TRIPS } from '../story/distance'
import { scroll } from '../story/scrollState'
import type { Stage } from '../state/store'
import { Label } from './Label'
import { fonts } from './fonts'
import { RAIL_PHONE_SCALE, RAIL_REACH } from './Rail'
import { ui } from './tokens'

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

/** Gap between the readout and the rail at full swell, px. */
const RAIL_GAP = 14

/**
 * The year and running totals at the top right of the globe's stage, right-aligned and clear of the rail even when
 * its keys swell. Re-typesets only when a number changes.
 */
export function StoryHud({ stage, s, phone }: { stage: Stage; s: number; phone: boolean }) {
  const [state, setState] = useState(() => readout(timeline.time))
  useFrame(() => {
    const next = readout(timeline.time)
    if (next.title !== state.title || next.line !== state.line) setState(next)
  })
  const x = stage.x + stage.width - RAIL_REACH * (phone ? RAIL_PHONE_SCALE : 1) - RAIL_GAP * s
  const y = stage.y + 18 * s
  return (
    <group>
      <Label x={x} y={y} size={30 * s} color={ui.ink} font={fonts.display} lineHeight={1} align="right">
        {state.title}
      </Label>
      <Label x={x} y={y + 34 * s} size={11 * s} color={ui.inkDim} font={fonts.mono} letterSpacing={0.04} align="right">
        {state.line}
      </Label>
    </group>
  )
}
