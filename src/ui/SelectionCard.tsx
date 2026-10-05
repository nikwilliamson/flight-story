import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { airports, legs } from '../data'
import { fmt } from '../data/facts'
import { atEnd, clearSelection } from '../explore/explore'
import { rowFor } from '../explore/TabDriver'
import { replayHighlight } from '../scene/highlight'
import { useStory } from '../state/store'
import { legDate } from '../story/timeline'
import { Glass } from './Glass'
import { detailOf } from './interactive'
import { Label } from './Label'
import { layoutPills, Pill } from './kit'
import { tabBarTop, type Layout } from './layout'
import { space, type, ui } from './tokens'

const WIDTH = 340
const line = (role: keyof typeof type, s: number) => type[role].size * type[role].line * s

/** The selection's numbers: legs, miles, the years it spans, the airports it touches. */
function summary(set: readonly number[]) {
  const first = legs[set[0]]
  const last = legs[set[set.length - 1]]
  const miles = set.reduce((sum, i) => sum + (legs[i].miles ?? 0), 0)
  const fields = new Set(set.flatMap((i) => [legs[i].from, legs[i].to]).filter((a) => a >= 0))
  const from = first.sort.slice(0, 4)
  const to = last.sort.slice(0, 4)
  return [set.length === 1 ? legDate(first) : `${fmt(set.length)} legs`, `${fmt(miles)} mi`, set.length > 1 && (from === to ? from : `${from}–${to}`), set.length > 1 && `${fmt(fields.size)} airports`].filter(Boolean).join(' · ')
}

function titleOf(id: string, set: readonly number[]) {
  if (set.length === 1) {
    const l = legs[set[0]]
    const code = (a: number) => (a >= 0 ? airports[a].code : '?')
    return { title: `${code(l.from)}–${code(l.to)}`, detail: [l.airlineName, l.aircraft].filter(Boolean).join(' · ') }
  }
  const row = rowFor(id)
  return { title: row?.label ?? '', detail: row ? (detailOf(row) ?? '') : '' }
}

/**
 * What's selected, over the globe once it has flown there: its name, its numbers, and Replay (the set draws itself
 * again in order), Copy link and Clear. Desktop: the stage's bottom-left. Phones: just above the tab bar.
 */
export function SelectionCard({ layout, width }: { layout: Layout; width: number }) {
  const selection = useStory((st) => st.selection)
  const tab = useStory((st) => st.tab)
  const sheet = useStory((st) => st.sheet)
  const group = useRef<Group>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => setCopied(false), [selection])
  useFrame(() => {
    if (group.current) group.current.visible = atEnd()
  })
  if (!selection || !tab || (sheet && layout.phone) || !selection.legs.length) return null

  const s = layout.scale
  const pad = space.l * s
  const w = layout.phone ? width - 2 * space.l : Math.min(WIDTH * s, layout.stage.width - 2 * space.xl * s)
  const inner = w - 2 * pad
  const { title, detail } = titleOf(selection.id, selection.legs)
  const pills = [selection.legs.length > 1 ? 'Replay' : null, copied ? 'Copied' : 'Copy link', 'Clear'].filter((p): p is string => !!p)
  const { placed, height: pillsHeight } = layoutPills(pills, inner, s)
  const h = pad + line('displayM', s) + space.xs * s + (detail ? line('bodyS', s) : 0) + line('monoData', s) + space.m * s + pillsHeight + pad
  const x = layout.phone ? space.l : layout.stage.x + space.xl * s
  const y = layout.phone ? tabBarTop(layout) - space.s - h : layout.stage.y + layout.stage.height - space.xl * s - h
  const top = y + pad + line('displayM', s) + space.xs * s
  const actions: Record<string, () => void> = {
    Replay: replayHighlight,
    'Copy link': () => void navigator.clipboard?.writeText(location.href).then(() => setCopied(true), () => {}),
    Copied: () => {},
    Clear: clearSelection,
  }

  return (
    <group ref={group}>
      <Glass x={x} y={y} width={w} height={h} />
      <Label x={x + pad} y={y + pad} role="displayM" s={s} color={ui.ink} width={inner} nowrap>
        {title}
      </Label>
      {detail && (
        <Label x={x + pad} y={top} role="bodyS" s={s} color={ui.inkDim} width={inner} nowrap>
          {detail}
        </Label>
      )}
      <Label x={x + pad} y={top + (detail ? line('bodyS', s) : 0)} role="monoData" s={s} color={ui.inkDim} width={inner} nowrap>
        {summary(selection.legs)}
      </Label>
      {pills.map((p, i) => (
        <Pill
          key={p}
          x={x + pad + placed[i].x}
          y={y + h - pad - pillsHeight + placed[i].y}
          s={s}
          text={p}
          lit={p === 'Copied'}
          events={{
            onClick: (e) => {
              e.stopPropagation()
              actions[p]()
            },
          }}
        />
      ))}
    </group>
  )
}
