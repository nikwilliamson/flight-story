import type { ThreeEvent } from '@react-three/fiber'
import { useState } from 'react'
import { textWidth } from './cssTokens'
import { Glass } from './Glass'
import { Label } from './Label'
import { size, space, type, ui, type Role } from './tokens'

/** The pointer's look over the scene's UI: one place sets it, so nothing leaves it stuck on "pointer". */
export const pointer = (on: boolean) => void (document.body.style.cursor = on ? 'pointer' : '')

export interface HitEvents {
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void
  onClick?: (e: ThreeEvent<MouseEvent>) => void
}

/** An invisible hit area in px space (top-left anchored), for rows, pills and links. */
export function Hit({ x, y, width, height, ...events }: { x: number; y: number; width: number; height: number } & HitEvents) {
  return (
    <mesh position={[x + width / 2, -(y + height / 2), 0.5]} {...events}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
    </mesh>
  )
}

/** Height of a section label and the space under it, before what it heads. */
export const headHeight = (s: number) => type.monoLabel.size * type.monoLabel.line * s + space.s * s

/** The small upper-case label over a module ("MOST LEGS", "CHAPTER STATS"). */
export function SectionLabel({ y, text, s, color = ui.inkFaint }: { y: number; text: string; s: number; color?: typeof ui.ink }) {
  return (
    <Label y={y} role="monoLabel" s={s} color={color}>
      {text}
    </Label>
  )
}

export type PillSize = 'l' | 's'
const pillHeight = (p: PillSize, s: number) => (p === 'l' ? size.pill : size.pillS) * s
const pillRole = (mono: boolean): Role => (mono ? 'monoData' : 'bodyS')
export const pillWidth = (text: string, s: number, mono = false) => textWidth(text, pillRole(mono), s) + 2 * space.m * s

/**
 * The one pill: tabs (HTML, .pill), filters, "Show all", and the static chips. Lit means white text on a brighter
 * fill, like a lit line on the globe; at rest the text is dim.
 */
export function Pill({ x, y, text, s, p = 's', mono = false, lit = false, events }: { x: number; y: number; text: string; s: number; p?: PillSize; mono?: boolean; lit?: boolean; events?: HitEvents }) {
  const [over, setOver] = useState(false)
  const on = lit || over
  const h = pillHeight(p, s)
  const w = pillWidth(text, s, mono)
  const role = type[pillRole(mono)]
  const hit: HitEvents | undefined = events && {
    ...events,
    onPointerOver: (e) => {
      e.stopPropagation()
      setOver(true)
      pointer(true)
      events.onPointerOver?.(e)
    },
    onPointerOut: (e) => {
      setOver(false)
      pointer(false)
      events.onPointerOut?.(e)
    },
  }
  return (
    <group>
      <Glass x={x} y={y} width={w} height={h} radius={h / 2} glow={on ? 0.6 : 0} fill={on ? 0.95 : 0.55} color={ui.chip} />
      <Label x={x + w / 2} y={y + (h - role.size * s * role.line) / 2} role={pillRole(mono)} s={s} color={on ? ui.ink : ui.inkDim} align="center">
        {text}
      </Label>
      {hit && <Hit x={x} y={y} width={w} height={h} {...hit} />}
    </group>
  )
}

/** Wraps pills into rows within `width`; returns where each sits and the block's height. */
export function layoutPills(items: string[], width: number, s: number, p: PillSize = 's', mono = false) {
  const h = pillHeight(p, s)
  const gap = space.s * s
  const placed: { x: number; y: number }[] = []
  let x = 0
  let row = 0
  for (const text of items) {
    const w = pillWidth(text, s, mono)
    if (x > 0 && x + w > width) {
      x = 0
      row++
    }
    placed.push({ x, y: row * (h + gap) })
    x += w + gap
  }
  return { placed, height: (row + 1) * h + row * gap }
}

export const rowHeight = (detail: boolean, s: number) => (detail ? size.rowDetail : size.row) * s

/**
 * The one list row, in story cards, tab panels and (as CSS) the sheet: a rank, the label with its detail under it, and
 * the count. Lit is white, with a chip behind it.
 */
export function RankRow({ y, width, s, rank, label, detail, count, lit = false, events }: { y: number; width: number; s: number; rank: number; label: string; detail?: string; count: string; lit?: boolean; events?: HitEvents }) {
  const h = rowHeight(detail !== undefined, s)
  const body = type.body.size * type.body.line * s
  const top = y + (size.row * s - body) / 2
  const mono = (type.body.size - type.monoData.size) * 0.5 * s
  const countW = textWidth(count, 'monoData', s)
  const labelX = size.rank * s
  return (
    <group>
      {lit && <Glass x={-space.s * s} y={y} width={width + 2 * space.s * s} height={h} radius={space.s * s} glow={0} fill={0.7} color={ui.chip} />}
      <Label x={0} y={top + mono} role="monoData" s={s} color={lit ? ui.ink : ui.inkFaint}>
        {String(rank).padStart(2, '0')}
      </Label>
      <Label x={labelX} y={top} role="body" s={s} color={ui.ink} width={width - labelX - countW - space.m * s} nowrap>
        {label}
      </Label>
      {detail !== undefined && (
        <Label x={labelX} y={top + body - space.xs * s} role="bodyS" s={s} color={ui.inkDim} width={width - labelX - countW - space.m * s} nowrap>
          {detail}
        </Label>
      )}
      <Label x={width} y={top + mono} role="monoData" s={s} color={lit ? ui.ink : ui.inkDim} align="right">
        {count}
      </Label>
      {events && <Hit x={-space.s * s} y={y} width={width + 2 * space.s * s} height={h} {...events} />}
    </group>
  )
}
