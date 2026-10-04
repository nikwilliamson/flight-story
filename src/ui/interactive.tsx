import { useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { fmt } from '../data/facts'
import { select } from '../explore/explore'
import { LISTS, type ListId, type ListRow } from '../explore/lists'
import { useStory, type SheetId } from '../state/store'
import { Glass } from './Glass'
import { Label } from './Label'
import { fonts } from './fonts'
import { ui } from './tokens'

const LABEL = 10.5

/** Body text is proportional; this is a safe average advance for sizing chips and buttons without measuring. */
export const bodyWidth = (text: string, size: number) => text.length * 0.56 * size

/** Pointer handlers shared by every hoverable thing after the story: hover lights, leaving clears, click flies. */
export function useRowEvents() {
  const [hovered, setHovered] = useState<string | null>(null)
  const on = (row: ListRow) => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      setHovered(row.id)
      useStory.getState().setHover(row.legs)
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => {
      setHovered((h) => (h === row.id ? null : h))
      useStory.getState().setHover(null)
      document.body.style.cursor = ''
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      select(row)
    },
  })
  return { hovered, on }
}

/** An invisible hit area in px space (top-left anchored), for rows and chips. */
export function Hit({ x, y, width, height, ...events }: { x: number; y: number; width: number; height: number } & Partial<ReturnType<ReturnType<typeof useRowEvents>['on']>>) {
  return (
    <mesh position={[x + width / 2, -(y + height / 2), 0.5]} {...events}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
    </mesh>
  )
}

export function listHeight(top: number, s: number) {
  return LABEL * s * 1.3 + 8 * s + top * 26 * s + 12 * s + 30 * s
}

/** A ranked list's top rows, most first, then "Show all" which opens the full list with search. */
export function ListModule({ y, width, s, label, list, top }: { y: number; width: number; s: number; label: string; list: ListId; top: number }) {
  const { hovered, on } = useRowEvents()
  const selected = useStory((st) => st.selection?.id)
  const { rows } = LISTS[list]
  const head = LABEL * s * 1.3 + 8 * s
  const line = 26 * s
  const button = `Show all ${fmt(rows.length)}`
  const buttonY = y + head + top * line + 12 * s
  const buttonW = bodyWidth(button, 13 * s) + 28 * s
  return (
    <group>
      <Label y={y} size={LABEL * s} color={ui.inkFaint} font={fonts.mono} letterSpacing={0.12}>
        {label.toUpperCase()}
      </Label>
      {rows.slice(0, top).map((row, i) => {
        const ry = y + head + i * line
        const lit = hovered === row.id || selected === row.id
        const tagW = row.tag ? bodyWidth(row.tag, 10 * s) + 14 * s : 0
        return (
          <group key={row.id}>
            {lit && <Glass x={-8 * s} y={ry - 3 * s} width={width + 16 * s} height={line} radius={6 * s} glow={0} fill={0.7} color={ui.chip} />}
            <Label x={0} y={ry + 2 * s} size={11 * s} color={lit ? ui.international : ui.inkFaint} font={fonts.mono}>
              {String(i + 1).padStart(2, '0')}
            </Label>
            <Label x={28 * s} y={ry} size={15 * s} color={ui.ink} width={width - 100 * s - tagW} nowrap>
              {row.label}
            </Label>
            {row.tag && (
              <Label x={width - 52 * s} y={ry + 3 * s} size={10 * s} color={ui.international} font={fonts.mono} align="right" letterSpacing={0.08}>
                {row.tag.toUpperCase()}
              </Label>
            )}
            <Label x={width} y={ry + 2 * s} size={12.5 * s} color={lit ? ui.ink : ui.inkDim} font={fonts.mono} align="right">
              {fmt(row.count)}
            </Label>
            <Hit x={-8 * s} y={ry - 3 * s} width={width + 16 * s} height={line} {...on(row)} />
          </group>
        )
      })}
      <SheetButton x={0} y={buttonY} width={buttonW} height={30 * s} s={s} text={button} sheet={list} />
    </group>
  )
}

export function SheetButton({ x, y, width, height, s, text, sheet }: { x: number; y: number; width: number; height: number; s: number; text: string; sheet: SheetId }) {
  const [over, setOver] = useState(false)
  return (
    <group>
      <Glass x={x} y={y} width={width} height={height} radius={height / 2} glow={over ? 0.6 : 0} fill={over ? 0.9 : 0.6} color={ui.chip} />
      <Label x={x + width / 2} y={y + (height - 13 * s * 1.2) / 2} size={13 * s} color={over ? ui.ink : ui.domestic} align="center" lineHeight={1.2}>
        {text}
      </Label>
      <Hit
        x={x}
        y={y}
        width={width}
        height={height}
        onPointerOver={(e) => {
          e.stopPropagation()
          setOver(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setOver(false)
          document.body.style.cursor = ''
        }}
        onClick={(e) => {
          e.stopPropagation()
          useStory.getState().setSheet(sheet)
        }}
      />
    </group>
  )
}

/** Wrapped chips, laid out analytically; returns the layout so the row knows its height up front. */
export function layoutChips(items: string[], width: number, s: number) {
  const size = 12.5 * s
  const h = 28 * s
  const pad = 12 * s
  const spacing = 6 * s
  const placed: { x: number; row: number; w: number }[] = []
  let x = 0
  let row = 0
  for (const text of items) {
    const w = bodyWidth(text, size) + 2 * pad
    if (x > 0 && x + w > width) {
      x = 0
      row++
    }
    placed.push({ x, row, w })
    x += w + spacing
  }
  const rows = row + 1
  return { placed, size, h, pad, spacing, height: LABEL * s * 1.3 + 8 * s + rows * h + (rows - 1) * spacing }
}

export function FilterChips({ y, width, s, label, chips }: { y: number; width: number; s: number; label: string; chips: ListRow[] }) {
  const { hovered, on } = useRowEvents()
  const selected = useStory((st) => st.selection?.id)
  const { placed, size, h, spacing } = layoutChips(
    chips.map((c) => c.label),
    width,
    s,
  )
  const head = LABEL * s * 1.3 + 8 * s
  return (
    <group>
      <Label y={y} size={LABEL * s} color={ui.inkFaint} font={fonts.mono} letterSpacing={0.12}>
        {label.toUpperCase()}
      </Label>
      {chips.map((chip, i) => {
        const c = placed[i]
        const cy = y + head + c.row * (h + spacing)
        const lit = hovered === chip.id || selected === chip.id
        return (
          <group key={chip.id}>
            <Glass x={c.x} y={cy} width={c.w} height={h} radius={h / 2} glow={lit ? 0.5 : 0} fill={lit ? 0.95 : 0.5} color={ui.chip} />
            <Label x={c.x + c.w / 2} y={cy + (h - size * 1.2) / 2} size={size} color={lit ? ui.ink : ui.domestic} align="center" lineHeight={1.2}>
              {chip.label}
            </Label>
            <Hit x={c.x} y={cy} width={c.w} height={h} {...on(chip)} />
          </group>
        )
      })}
    </group>
  )
}
