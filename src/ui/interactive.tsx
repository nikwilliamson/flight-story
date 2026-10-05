import { useState } from 'react'
import { fmt } from '../data/facts'
import { select } from '../explore/explore'
import { LISTS, type ListId, type ListRow } from '../explore/lists'
import { useStory, type SheetId } from '../state/store'
import { headHeight, layoutPills, Pill, pointer, RankRow, rowHeight, SectionLabel, type HitEvents } from './kit'
import { size, space } from './tokens'

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
