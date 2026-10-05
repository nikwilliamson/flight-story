import { useState } from 'react'
import { fmt } from '../data/facts'
import { select } from '../explore/explore'
import { HOMES, LISTS, type ListId, type ListRow } from '../explore/lists'
import { useStory, type SheetId } from '../state/store'
import { textWidth } from './cssTokens'
import { Label } from './Label'
import { headHeight, Hit, layoutPills, Pill, pointer, RankRow, rowHeight, SectionLabel, type HitEvents } from './kit'
import { size, space, type, ui } from './tokens'

/** Pointer handlers shared by every hoverable thing after the story: hover lights, leaving clears, click flies. */
export function useRowEvents() {
  const [hovered, setHovered] = useState<string | null>(null)
  const on = (row: ListRow): HitEvents => ({
    onPointerOver: (e) => {
      e.stopPropagation()
      setHovered(row.id)
      useStory.getState().setHover(row.legs)
      pointer(true)
    },
    onPointerOut: () => {
      setHovered((h) => (h === row.id ? null : h))
      useStory.getState().setHover(null)
      pointer(false)
    },
    onClick: (e) => {
      e.stopPropagation()
      select(row)
    },
  })
  return { hovered, on }
}

/** A row's second line: its detail, with a tag ("gone", "closed") in front. */
export const detailOf = (row: ListRow) => [row.tag && row.tag[0].toUpperCase() + row.tag.slice(1), row.detail].filter(Boolean).join(' · ') || undefined

/** Lists whose rows carry a bar of their share of the top row: the counts there are the story. */
const BARS = new Set<ListId>(['families', 'planes', 'airlines'])

const hasDetail = (list: ListId) => LISTS[list].rows.some((r) => detailOf(r))

export function listHeight(list: ListId, top: number, s: number) {
  return headHeight(s) + top * rowHeight(hasDetail(list), s) + space.m * s + size.pill * s
}

/** A ranked list's top rows, most first, then "Show all" which opens the full list with search. */
export function ListModule({ y, width, s, label, list, top }: { y: number; width: number; s: number; label: string; list: ListId; top: number }) {
  const { hovered, on } = useRowEvents()
  const selected = useStory((st) => st.selection?.id)
  const { rows } = LISTS[list]
  const line = rowHeight(hasDetail(list), s)
  const head = headHeight(s)
  return (
    <group>
      <SectionLabel y={y} text={label} s={s} />
      {rows.slice(0, top).map((row, i) => (
        <RankRow
          key={row.id}
          y={y + head + i * line}
          width={width}
          s={s}
          rank={i + 1}
          label={row.label}
          detail={hasDetail(list) ? (detailOf(row) ?? '') : undefined}
          count={fmt(row.count)}
          share={BARS.has(list) ? row.count / rows[0].count : undefined}
          faded={row.tag === 'gone'}
          lit={hovered === row.id || selected === row.id}
          events={on(row)}
        />
      ))}
      <Pill
        x={0}
        y={y + head + top * line + space.m * s}
        p="l"
        s={s}
        text={`Show all ${fmt(rows.length)}`}
        events={{
          onClick: (e) => {
            e.stopPropagation()
            useStory.getState().setSheet(list as SheetId)
          },
        }}
      />
    </group>
  )
}

export function filtersHeight(chips: ListRow[], width: number, s: number) {
  return headHeight(s) + layoutPills(chips.map((c) => c.label), width, s).height
}

export function FilterChips({ y, width, s, label, chips }: { y: number; width: number; s: number; label: string; chips: ListRow[] }) {
  const { hovered, on } = useRowEvents()
  const selected = useStory((st) => st.selection?.id)
  const { placed } = layoutPills(chips.map((c) => c.label), width, s)
  const head = headHeight(s)
  return (
    <group>
      <SectionLabel y={y} text={label} s={s} />
      {chips.map((chip, i) => (
        <Pill key={chip.id} x={placed[i].x} y={y + head + placed[i].y} s={s} text={chip.label} lit={hovered === chip.id || selected === chip.id} events={on(chip)} />
      ))}
    </group>
  )
}

const noRaycast = () => null
/** The timeline's bar thickness and the gap between stretches, px. */
const BAR = 6
const BAR_GAP = 2

export function homesHeight(s: number) {
  const mono = type.monoLabel.size * type.monoLabel.line * s
  const data = type.monoData.size * type.monoData.line * s
  return headHeight(s) + mono + space.xs * s + BAR * s + space.xs * s + data
}

/**
 * Where he flew from, on a line from the move to Fort Lauderdale to now: each home a stretch of the bar, named above
 * where there's room, lighting the legs flown from it. The current home is in the accent, as its ring on the globe.
 */
export function HomesTimeline({ y, width, s, label }: { y: number; width: number; s: number; label: string }) {
  const { hovered, on } = useRowEvents()
  const selected = useStory((st) => st.selection?.id)
  const head = headHeight(s)
  const mono = type.monoLabel.size * type.monoLabel.line * s
  const start = HOMES[0].from
  const end = HOMES[HOMES.length - 1].to
  const at = (year: number) => ((year - start) / (end - start)) * width
  const barY = y + head + mono + space.xs * s
  return (
    <group>
      <SectionLabel y={y} text={label} s={s} />
      {HOMES.map((h, k) => {
        const x0 = at(h.from) + (k ? BAR_GAP * s : 0) / 2
        const w = Math.max(3 * s, at(h.to) - at(h.from) - (k ? BAR_GAP * s : 0))
        const lit = hovered === h.id || selected === h.id
        const current = k === HOMES.length - 1
        const color = lit ? ui.ink : current ? ui.accent : ui.inkDim
        const code = h.label.split(' · ')[0]
        return (
          <group key={h.id}>
            {w >= textWidth(code, 'monoLabel', s) + space.xs * s && (
              <Label x={x0} y={y + head} role="monoLabel" s={s} color={lit ? ui.ink : ui.inkDim}>
                {code}
              </Label>
            )}
            <mesh position={[x0 + w / 2, -(barY + (BAR * s) / 2), 0.2]} raycast={noRaycast}>
              <planeGeometry args={[w, BAR * s]} />
              <meshBasicMaterial color={color} transparent opacity={lit ? 1 : 0.75} depthTest={false} depthWrite={false} />
            </mesh>
            <Hit x={x0} y={y + head} width={w} height={mono + space.xs * s + BAR * s + space.s * s} {...on(h)} />
          </group>
        )
      })}
      <Label x={0} y={barY + BAR * s + space.xs * s} role="monoData" s={s} color={ui.inkFaint}>
        {String(Math.floor(start))}
      </Label>
      <Label x={width} y={barY + BAR * s + space.xs * s} role="monoData" s={s} color={ui.inkFaint} align="right">
        Now
      </Label>
    </group>
  )
}
