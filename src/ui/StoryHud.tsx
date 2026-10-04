import { useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { legs } from '../data'
import { fmt } from '../data/facts'
import { STORY_END, timeline } from '../story/timeline'
import type { Stage } from '../state/store'
import { Label } from './Label'
import { fonts } from './fonts'
import { ui } from './tokens'

const cumulative = new Float64Array(legs.length)
legs.forEach((l, i) => (cumulative[i] = (i ? cumulative[i - 1] : 0) + (l.miles ?? 0)))
const firstYear = legs[0].sort.slice(0, 4)
const lastYear = legs[legs.length - 1].sort.slice(0, 4)

/** "c." when the logbook only knows the month or year (most of the 1980s). */
function readout(time: number) {
  if (time >= STORY_END) return { year: `${firstYear}–${lastYear}`, count: legs.length }
  const count = Math.max(0, Math.min(legs.length, Math.floor(time + 0.5)))
  const leg = legs[Math.max(0, count - 1)]
  const approx = leg.precision !== 'Exact' && leg.precision !== 'Range'
  return { year: `${approx ? 'c. ' : ''}${leg.sort.slice(0, 4)}`, count }
}

/** The year and running totals over the globe's stage. Re-typesets only when a number changes. */
export function StoryHud({ stage, s }: { stage: Stage; s: number }) {
  const [state, setState] = useState(() => readout(timeline.time))
  useFrame(() => {
    const next = readout(timeline.time)
    if (next.year !== state.year || next.count !== state.count) setState(next)
  })
  const x = stage.x + 20 * s
  const y = stage.y + 18 * s
  const miles = state.count ? cumulative[state.count - 1] : 0
  return (
    <group>
      <Label x={x} y={y} size={30 * s} color={ui.ink} font={fonts.display} lineHeight={1}>
        {state.year}
      </Label>
      <Label x={x} y={y + 34 * s} size={11 * s} color={ui.inkDim} font={fonts.mono} letterSpacing={0.04}>
        {`leg ${fmt(state.count)} of ${fmt(legs.length)} · ${fmt(miles)} mi`}
      </Label>
    </group>
  )
}
