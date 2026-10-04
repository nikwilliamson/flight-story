import type * as THREE from 'three'
import { useEffect, useState, type ReactNode } from 'react'
import type { Module, Plane } from '../story/chapters'
import { Glass } from './Glass'
import { Label } from './Label'
import { fonts } from './fonts'
import { ui } from './tokens'

/**
 * A card is a column of rows. A row either knows its height up front (single-line layouts, computed from the type
 * scale) or measures itself once troika has typeset its text (paragraphs).
 */
export interface Row {
  gap: number
  /** Known height, px; omitted = measured. */
  height?: number
  render: (y: number, onHeight: (h: number) => void) => ReactNode
}

/** IBM Plex Mono advances every glyph 0.6 em, so mono widths are exact without measuring. */
const monoWidth = (text: string, size: number) => text.length * 0.6 * size

const LABEL = 10.5
const labelHeight = (s: number) => LABEL * s * 1.3

function SectionLabel({ y, text, s }: { y: number; text: string; s: number }) {
  return (
    <Label y={y} size={LABEL * s} color={ui.inkFaint} font={fonts.mono} letterSpacing={0.12}>
      {text.toUpperCase()}
    </Label>
  )
}

export function textRow(text: string, opts: { size: number; color: THREE.ColorRepresentation; font?: string; gap: number; width: number; letterSpacing?: number; lineHeight?: number; colorRanges?: Record<number, THREE.ColorRepresentation> }): Row {
  return {
    gap: opts.gap,
    render: (y, onHeight) => (
      <Label y={y} width={opts.width} size={opts.size} color={opts.color} font={opts.font} letterSpacing={opts.letterSpacing} lineHeight={opts.lineHeight} colorRanges={opts.colorRanges} onHeight={onHeight}>
        {text}
      </Label>
    ),
  }
}

/** One module as a row, laid out for a card `width` px wide at type scale `s`. */
export function moduleRow(m: Module, width: number, s: number): Row {
  const gap = 22 * s
  const head = labelHeight(s) + 8 * s
  switch (m.kind) {
    case 'stats': {
      const cols = width >= 360 ? 4 : 2
      const cell = (width - (cols - 1) * 12 * s) / cols
      const valueSize = 21 * s
      const cellHeight = LABEL * s * 1.3 + 3 * s + valueSize * 1.1
      const rows = Math.ceil(m.items.length / cols)
      return {
        gap,
        height: head + rows * cellHeight + (rows - 1) * 10 * s,
        render: (y) => (
          <group>
            <SectionLabel y={y} text={m.label} s={s} />
            {m.items.map(([k, v], i) => {
              const cx = (i % cols) * (cell + 12 * s)
              const cy = y + head + Math.floor(i / cols) * (cellHeight + 10 * s)
              return (
                <group key={k}>
                  <Label x={cx} y={cy} size={LABEL * s} color={ui.inkDim} font={fonts.mono} letterSpacing={0.06}>
                    {k}
                  </Label>
                  <Label x={cx} y={cy + LABEL * s * 1.3 + 3 * s} size={valueSize} color={ui.ink} font={fonts.displayMedium} lineHeight={1.1}>
                    {v}
                  </Label>
                </group>
              )
            })}
          </group>
        ),
      }
    }
    case 'rank': {
      const line = 25 * s
      return {
        gap,
        height: head + m.items.length * line,
        render: (y) => (
          <group>
            <SectionLabel y={y} text={m.label} s={s} />
            {m.items.map(([k, v], i) => (
              <group key={k}>
                <Label x={0} y={y + head + i * line} size={11 * s} color={ui.inkFaint} font={fonts.mono}>
                  {String(i + 1).padStart(2, '0')}
                </Label>
                <Label x={28 * s} y={y + head + i * line - 2 * s} size={15 * s} color={ui.ink} width={width - 90 * s} nowrap>
                  {k}
                </Label>
                <Label x={width} y={y + head + i * line} size={12.5 * s} color={ui.inkDim} font={fonts.mono} align="right">
                  {v}
                </Label>
              </group>
            ))}
          </group>
        ),
      }
    }
    case 'chips': {
      const size = 12.5 * s
      const h = 26 * s
      const pad = 10 * s
      const spacing = 6 * s
      // Wrap analytically: mono text has a fixed advance.
      const placed: { x: number; row: number; w: number; text: string }[] = []
      let x = 0
      let row = 0
      for (const text of m.items) {
        const w = monoWidth(text, size) + 2 * pad
        if (x > 0 && x + w > width) {
          x = 0
          row++
        }
        placed.push({ x, row, w, text })
        x += w + spacing
      }
      const rows = row + 1
      return {
        gap,
        height: head + rows * h + (rows - 1) * spacing,
        render: (y) => (
          <group>
            <SectionLabel y={y} text={m.label} s={s} />
            {placed.map((c, i) => {
              const cy = y + head + c.row * (h + spacing)
              return (
                <group key={i}>
                  <Glass x={c.x} y={cy} width={c.w} height={h} radius={h / 2} glow={0} fill={0.5} color={ui.chip} />
                  <Label x={c.x + pad} y={cy + (h - size * 1.2) / 2} size={size} color={ui.domestic} font={fonts.mono} lineHeight={1.2}>
                    {c.text}
                  </Label>
                </group>
              )
            })}
          </group>
        ),
      }
    }
    case 'fact': {
      const inset = 14 * s
      return {
        gap,
        render: (y, onHeight) => <Fact y={y} width={width} inset={inset} s={s} text={m.text} onHeight={onHeight} />,
      }
    }
    case 'pass': {
      const code = 34 * s
      const city = 12.5 * s
      const top = head + code * 1.05 + 4 * s + city * 1.4
      const half = width / 2
      return {
        gap,
        height: top + 14 * s + Math.ceil(m.rows.length / 2) * (LABEL * s * 1.3 + 3 * s + 15 * s * 1.3 + 8 * s),
        render: (y) => (
          <group>
            <SectionLabel y={y} text={m.label} s={s} />
            {[m.from, m.to].map(([c, name], i) => (
              <group key={c}>
                <Label x={i ? width : 0} align={i ? 'right' : 'left'} y={y + head} size={code} color={ui.ink} font={fonts.display} lineHeight={1.05}>
                  {c}
                </Label>
                <Label x={i ? width : 0} align={i ? 'right' : 'left'} y={y + head + code * 1.05 + 4 * s} size={city} color={ui.inkDim}>
                  {name}
                </Label>
              </group>
            ))}
            <Glass x={monoWidth('XXX', code) + 16 * s} y={y + head + code * 0.55} width={width - 2 * (monoWidth('XXX', code) + 16 * s)} height={1.5} radius={0} glow={0} fill={0.9} color={ui.international} />
            {m.rows.map(([k, v], i) => {
              const cx = (i % 2) * half
              const cy = y + top + 14 * s + Math.floor(i / 2) * (LABEL * s * 1.3 + 3 * s + 15 * s * 1.3 + 8 * s)
              return (
                <group key={k}>
                  <Label x={cx} y={cy} size={LABEL * s} color={ui.inkFaint} font={fonts.mono} letterSpacing={0.08}>
                    {k.toUpperCase()}
                  </Label>
                  <Label x={cx} y={cy + LABEL * s * 1.3 + 3 * s} size={15 * s} color={ui.ink} width={half - 12 * s} nowrap>
                    {v}
                  </Label>
                </group>
              )
            })}
          </group>
        ),
      }
    }
    case 'table': {
      const line = 24 * s
      const size = 13 * s
      return {
        gap,
        height: head + m.rows.length * line,
        render: (y) => (
          <group>
            <SectionLabel y={y} text={m.label} s={s} />
            {m.rows.map((r, i) => (
              <group key={i}>
                <Label x={0} y={y + head + i * line} size={size} color={ui.ink} font={fonts.mono}>
                  {r[0]}
                </Label>
                <Label x={width * 0.5} y={y + head + i * line} size={size} color={ui.inkDim} font={fonts.mono}>
                  {r[1]}
                </Label>
                <Label x={width} align="right" y={y + head + i * line} size={size} color={ui.international} font={fonts.mono}>
                  {`${r[2]} mi`}
                </Label>
              </group>
            ))}
          </group>
        ),
      }
    }
    case 'planes': {
      return {
        gap,
        render: (y, onHeight) => <PlaneList y={y} width={width} s={s} label={m.label} planes={m.planes} onHeight={onHeight} />,
      }
    }
    case 'nights': {
      const cols = 10
      const spacing = 4 * s
      const cw = (width - (cols - 1) * spacing) / cols
      const ch = 30 * s
      const rows = Math.ceil(m.nights.length / cols)
      const size = Math.min(10 * s, cw / (3 * 0.6) - 1)
      return {
        gap,
        height: head + rows * ch + (rows - 1) * spacing,
        render: (y) => (
          <group>
            <SectionLabel y={y} text={m.label} s={s} />
            {m.nights.map((code, i) => {
              const cx = (i % cols) * (cw + spacing)
              const cy = y + head + Math.floor(i / cols) * (ch + spacing)
              return (
                <group key={i}>
                  <Glass x={cx} y={cy} width={cw} height={ch} radius={4 * s} glow={0} fill={code ? 0.75 : 0.18} color={code ? ui.chip : ui.glass} />
                  {code && (
                    <Label x={cx + cw / 2} align="center" y={cy + (ch - size * 1.2) / 2} size={size} color={ui.domestic} font={fonts.mono} lineHeight={1.2}>
                      {code}
                    </Label>
                  )}
                </group>
              )
            })}
          </group>
        ),
      }
    }
  }
}

function Fact({ y, width, inset, s, text, onHeight }: { y: number; width: number; inset: number; s: number; text: string; onHeight: (h: number) => void }) {
  const top = labelHeight(s) + 6 * s
  return (
    <group>
      <Label x={inset} y={y} size={LABEL * s} color={ui.international} font={fonts.mono} letterSpacing={0.12}>
        FUN FACT
      </Label>
      <Label x={inset} y={y + top} width={width - inset} size={15 * s} color={ui.ink} onHeight={(h) => onHeight(top + h)}>
        {text}
      </Label>
      <FactRule y={y} s={s} />
    </group>
  )
}

/** A short amber tick beside the FUN FACT label. */
function FactRule({ y, s }: { y: number; s: number }) {
  return <Glass x={0} y={y + 1} width={2 * s} height={LABEL * s * 1.3} radius={1} glow={0} fill={1} color={ui.international} />
}

/**
 * Airframe cards stacked on small glass panels: aircraft and tail, its age and where he flew it (mono), then its
 * story. Each story is measured, so the list reports its height once every card has typeset.
 */
function PlaneList({ y, width, s, label, planes, onHeight }: { y: number; width: number; s: number; label: string; planes: Plane[]; onHeight: (h: number) => void }) {
  const [stories, setStories] = useState<(number | undefined)[]>([])
  const pad = 12 * s
  const spacing = 8 * s
  const title = 16 * s
  const meta = 11 * s
  const metaHeight = 2 * meta * 1.4
  const head = labelHeight(s) + 8 * s
  const heights = planes.map((p, i) => (p.story ? stories[i] : 0))
  const ready = heights.every((h) => h !== undefined)
  const cards: { top: number; height: number }[] = []
  let cursor = head
  planes.forEach((p, i) => {
    const height = 2 * pad + title * 1.2 + 6 * s + metaHeight + (p.story ? 8 * s + (heights[i] ?? 0) : 0)
    cards.push({ top: cursor, height })
    cursor += height + spacing
  })
  const total = cursor - spacing
  useEffect(() => {
    if (ready) onHeight(total)
  }, [ready, total, onHeight])

  return (
    <group>
      <SectionLabel y={y} text={label} s={s} />
      {planes.map((p, i) => {
        const top = y + cards[i].top
        const inner = width - 2 * pad - 3 * s
        const x = pad + 3 * s
        return (
          <group key={p.leg}>
            {ready && <Glass x={0} y={top} width={width} height={cards[i].height} radius={8 * s} glow={0} fill={0.55} color={ui.chip} />}
            <Glass x={0} y={top + pad} width={2 * s} height={title * 1.2} radius={1} glow={0} fill={1} color={ui.international} />
            <Label x={x} y={top + pad} size={title} color={ui.ink} font={fonts.displayMedium} lineHeight={1.2} width={inner} nowrap>
              {p.title}
            </Label>
            <Label x={x} y={top + pad + title * 1.2 + 6 * s} size={meta} color={ui.inkDim} font={fonts.mono} lineHeight={1.4} width={inner} nowrap>
              {p.meta}
            </Label>
            {p.story && (
              <Label
                x={x}
                y={top + pad + title * 1.2 + 6 * s + metaHeight + 8 * s}
                size={14 * s}
                color={ui.ink}
                width={inner}
                onHeight={(h) => setStories((prev) => (Math.abs((prev[i] ?? -1) - h) < 0.5 ? prev : Object.assign([...prev], { [i]: h })))}
              >
                {p.story}
              </Label>
            )}
          </group>
        )
      })}
    </group>
  )
}
