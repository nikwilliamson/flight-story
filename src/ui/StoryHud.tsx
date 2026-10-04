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
import { ui } from './tokens'

const cumulative = new Float64Array(legs.length)
legs.forEach((l, i) => (cumulative[i] = (i ? cumulative[i - 1] : 0) + (l.miles ?? 0)))
const firstYear = legs[0].sort.slice(0, 4)
const lastYear = legs[legs.length - 1].sort.slice(0, 4)

/** "c." when the logbook only knows the month or year (most of the 1980s). */
function readout(time: number): { title: string; line: string } {
  // The distance section counts its own line: laps up, then Moon trips up while the laps still wound count down.
  const scene = CHAPTERS[scroll.active]?.scene
  if (scene === 'laps') return { title: `${fmt(distance.laps * LAPS, 1)} laps`, line: `of ${fmt(LAPS, 1)} around the Earth · ${fmt(distance.laps * total)} mi` }
  if (scene === 'moon') return { title: `${fmt(distance.moon * MOON_TRIPS, 1)} Moon trips`, line: `${fmt((1 - distance.moon) * LAPS, 1)} laps still wound · ${fmt(total)} mi` }
  if (time >= STORY_END) return { title: `${firstYear}–${lastYear}`, line: countLine(legs.length) }
  const count = Math.max(0, Math.min(legs.length, Math.floor(time + 0.5)))
  const leg = legs[Math.max(0, count - 1)]
  const approx = leg.precision !== 'Exact' && leg.precision !== 'Range'
  return { title: `${approx ? 'c. ' : ''}${leg.sort.slice(0, 4)}`, line: countLine(count) }
}

const total = cumulative[legs.length - 1]
const countLine = (count: number) => `leg ${fmt(count)} of ${fmt(legs.length)} · ${fmt(count ? cumulative[count - 1] : 0)} mi`

/** The year and running totals over the globe's stage. Re-typesets only when a number changes. */
export function StoryHud({ stage, s }: { stage: Stage; s: number }) {
  const [state, setState] = useState(() => readout(timeline.time))
  useFrame(() => {
    const next = readout(timeline.time)
    if (next.title !== state.title || next.line !== state.line) setState(next)
  })
  const x = stage.x + 20 * s
  const y = stage.y + 18 * s
  return (
    <group>
      <Label x={x} y={y} size={30 * s} color={ui.ink} font={fonts.display} lineHeight={1}>
        {state.title}
      </Label>
      <Label x={x} y={y + 34 * s} size={11 * s} color={ui.inkDim} font={fonts.mono} letterSpacing={0.04}>
        {state.line}
      </Label>
    </group>
  )
}
