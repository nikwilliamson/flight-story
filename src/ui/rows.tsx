import type * as THREE from 'three'
import { useEffect, useState, type ReactNode } from 'react'
import type { Module, Plane } from '../story/chapters'
import { textWidth } from './cssTokens'
import { Glass } from './Glass'
import { Label } from './Label'
import { FilterChips, filtersHeight, ListModule, listHeight } from './interactive'
import { headHeight, layoutPills, Pill, RankRow, rowHeight, SectionLabel } from './kit'
import { creditHeight, PHOTO_ASPECT, PlanePhoto } from './PlanePhoto'
import { radius, space, type, ui, type Role } from './tokens'

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

/** One line of a role, px. */
const lineOf = (role: Role, s: number) => type[role].size * type[role].line * s

export function textRow(text: string, opts: { role: Role; s: number; color: THREE.ColorRepresentation; gap: number; width: number; colorRanges?: Record<number, THREE.ColorRepresentation> }): Row {
  return {
    gap: opts.gap,
    render: (y, onHeight) => (
      <Label y={y} width={opts.width} role={opts.role} s={opts.s} color={opts.color} colorRanges={opts.colorRanges} onHeight={onHeight}>
        {text}
      </Label>
    ),
  }
}

/** One module as a row, laid out for a card `width` px wide at type scale `s`. */
export function moduleRow(m: Module, width: number, s: number): Row {
  const gap = space.xl * s
  const head = headHeight(s)
  switch (m.kind) {
    case 'stats': {
      const cols = width >= 360 ? 4 : 2
      const cell = (width - (cols - 1) * space.m * s) / cols
      const cellHeight = lineOf('monoLabel', s) + space.xs * s + lineOf('displayM', s)
      const rows = Math.ceil(m.items.length / cols)
      return {
        gap,
        height: head + rows * cellHeight + (rows - 1) * space.m * s,
        render: (y) => (
          <group>
            <SectionLabel y={y} text={m.label} s={s} />
            {m.items.map(([k, v], i) => {
              const cx = (i % cols) * (cell + space.m * s)
              const cy = y + head + Math.floor(i / cols) * (cellHeight + space.m * s)
              return (
                <group key={k}>
                  <Label x={cx} y={cy} role="monoLabel" s={s} color={ui.inkDim}>
                    {k}
                  </Label>
                  <Label x={cx} y={cy + lineOf('monoLabel', s) + space.xs * s} role="displayM" s={s} color={ui.ink}>
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
      const line = rowHeight(false, s)
      return {
        gap,
        height: head + m.items.length * line,
        render: (y) => (
          <group>
            <SectionLabel y={y} text={m.label} s={s} />
            {m.items.map(([k, v], i) => (
              <RankRow key={k} y={y + head + i * line} width={width} s={s} rank={i + 1} label={k} count={v} />
            ))}
          </group>
        ),
      }
    }
    case 'chips': {
      const { placed, height } = layoutPills(m.items, width, s, 's', true)
      return {
        gap,
        height: head + height,
        render: (y) => (
          <group>
            <SectionLabel y={y} text={m.label} s={s} />
            {m.items.map((text, i) => (
              <Pill key={i} x={placed[i].x} y={y + head + placed[i].y} s={s} text={text} mono />
            ))}
          </group>
        ),
      }
    }
    case 'fact':
      return { gap, render: (y, onHeight) => <Fact y={y} width={width} s={s} text={m.text} onHeight={onHeight} /> }
    case 'pass': {
      const codeH = lineOf('displayL', s)
      const top = head + codeH + space.xs * s + lineOf('bodyS', s)
      const half = width / 2
      const cell = lineOf('monoLabel', s) + space.xs * s + lineOf('body', s) + space.s * s
      const codeW = textWidth('XXX', 'displayL', s) + space.l * s
      return {
        gap,
        height: top + space.l * s + Math.ceil(m.rows.length / 2) * cell,
        render: (y) => (
          <group>
            <SectionLabel y={y} text={m.label} s={s} />
            {[m.from, m.to].map(([c, name], i) => (
              <group key={c}>
                <Label x={i ? width : 0} align={i ? 'right' : 'left'} y={y + head} role="displayL" s={s} color={ui.ink}>
                  {c}
                </Label>
                <Label x={i ? width : 0} align={i ? 'right' : 'left'} y={y + head + codeH + space.xs * s} role="bodyS" s={s} color={ui.inkDim}>
                  {name}
                </Label>
              </group>
            ))}
            {/* The route, in its own colour, as on the globe. */}
            <Glass x={codeW} y={y + head + codeH * 0.55} width={width - 2 * codeW} height={1.5} radius={0} glow={0} fill={0.9} color={m.intl ? ui.international : ui.domestic} />
            {m.rows.map(([k, v], i) => {
              const cx = (i % 2) * half
              const cy = y + top + space.l * s + Math.floor(i / 2) * cell
              return (
                <group key={k}>
                  <Label x={cx} y={cy} role="monoLabel" s={s} color={ui.inkFaint}>
                    {k}
                  </Label>
                  <Label x={cx} y={cy + lineOf('monoLabel', s) + space.xs * s} role="body" s={s} color={ui.ink} width={half - space.m * s} nowrap>
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
      const line = rowHeight(false, s)
      return {
        gap,
        height: head + m.rows.length * line,
        render: (y) => (
          <group>
            <SectionLabel y={y} text={m.label} s={s} />
            {m.rows.map((r, i) => (
              <group key={i}>
                <Label x={0} y={y + head + i * line} role="monoData" s={s} color={ui.ink}>
                  {r[0]}
                </Label>
                <Label x={width * 0.5} y={y + head + i * line} role="monoData" s={s} color={ui.inkDim}>
                  {r[1]}
                </Label>
                <Label x={width} align="right" y={y + head + i * line} role="monoData" s={s} color={ui.ink}>
                  {`${r[2]} mi`}
                </Label>
              </group>
            ))}
          </group>
        ),
      }
    }
    case 'planes':
      return { gap, render: (y, onHeight) => <PlaneList y={y} width={width} s={s} label={m.label} planes={m.planes} onHeight={onHeight} /> }
    case 'list':
      return { gap, height: listHeight(m.list, m.top, s), render: (y) => <ListModule y={y} width={width} s={s} label={m.label} list={m.list} top={m.top} /> }
    case 'filters':
      return { gap, height: filtersHeight(m.chips, width, s), render: (y) => <FilterChips y={y} width={width} s={s} label={m.label} chips={m.chips} /> }
    case 'nights': {
      const cols = 10
      const spacing = space.xs * s
      const cw = (width - (cols - 1) * spacing) / cols
      const ch = 30 * s
      const rows = Math.ceil(m.nights.length / cols)
      // Sized to fit three letters in a cell: the one label that follows its box, not the type scale.
      const size = Math.min(type.monoData.size * s, cw / (3 * 0.6) - 1)
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
                  <Glass x={cx} y={cy} width={cw} height={ch} radius={space.xs * s} glow={0} fill={code ? 0.75 : 0.18} color={code ? ui.chip : ui.glass} />
                  {code && (
                    <Label x={cx + cw / 2} align="center" y={cy + (ch - size * type.monoData.line) / 2} role="monoData" size={size} color={ui.inkDim}>
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

function Fact({ y, width, s, text, onHeight }: { y: number; width: number; s: number; text: string; onHeight: (h: number) => void }) {
  const inset = space.l * s
  const top = headHeight(s)
  return (
    <group>
      <Label x={inset} y={y} role="monoLabel" s={s} color={ui.accent}>
        Fun fact
      </Label>
      <Label x={inset} y={y + top} width={width - inset} role="body" s={s} color={ui.ink} onHeight={(h) => onHeight(top + h)}>
        {text}
      </Label>
      <AccentTick y={y + 1} height={lineOf('monoLabel', s)} s={s} />
    </group>
  )
}

/** A short amber tick, the accent beside a fun fact or an aircraft's name. */
function AccentTick({ x = 0, y, height, s }: { x?: number; y: number; height: number; s: number }) {
  return <Glass x={x} y={y} width={2 * s} height={height} radius={1} glow={0} fill={1} color={ui.accent} />
}

/**
 * Airframe cards stacked on small glass panels: its photo when Commons has one, aircraft and tail, its age and where
 * he flew it (mono), then its story. Each story is measured and each photo looked up, so the list reports its height
 * once every card has settled.
 */
function PlaneList({ y, width, s, label, planes, onHeight }: { y: number; width: number; s: number; label: string; planes: Plane[]; onHeight: (h: number) => void }) {
  const [stories, setStories] = useState<(number | undefined)[]>([])
  const [photos, setPhotos] = useState<(boolean | undefined)[]>([])
  const pad = space.m * s
  const title = lineOf('displayS', s)
  const metaHeight = 2 * lineOf('monoData', s)
  const head = headHeight(s)
  const heights = planes.map((p, i) => (p.story ? stories[i] : 0))
  const photoW = width - 2 * pad
  const photoH = (i: number) => (photos[i] ? photoW * PHOTO_ASPECT + creditHeight(s) + space.s * s : 0)
  const ready = heights.every((h) => h !== undefined) && planes.every((_, i) => photos[i] !== undefined)
  const cards: { top: number; height: number }[] = []
  let cursor = head
  planes.forEach((p, i) => {
    const height = 2 * pad + photoH(i) + title + space.xs * s + metaHeight + (p.story ? space.s * s + (heights[i] ?? 0) : 0)
    cards.push({ top: cursor, height })
    cursor += height + space.s * s
  })
  const total = cursor - space.s * s
  useEffect(() => {
    if (ready) onHeight(total)
  }, [ready, total, onHeight])

  return (
    <group>
      <SectionLabel y={y} text={label} s={s} />
      {planes.map((p, i) => {
        const top = y + cards[i].top + photoH(i)
        const inner = width - 2 * pad - 3 * s
        const x = pad + 3 * s
        return (
          <group key={p.leg}>
            {ready && <Glass x={0} y={y + cards[i].top} width={width} height={cards[i].height} radius={radius.inner * s} glow={0} fill={0.55} color={ui.chip} />}
            <PlanePhoto
              tail={p.tail}
              x={pad}
              y={y + cards[i].top + pad}
              width={photoW}
              s={s}
              onPhoto={(has) => setPhotos((prev) => (prev[i] === has ? prev : Object.assign([...prev], { [i]: has })))}
            />
            <AccentTick x={pad} y={top + pad} height={title} s={s} />
            <Label x={x + space.xs * s} y={top + pad} role="displayS" s={s} color={ui.ink} width={inner} nowrap>
              {p.title}
            </Label>
            <Label x={x + space.xs * s} y={top + pad + title + space.xs * s} role="monoData" s={s} color={ui.inkDim} width={inner} nowrap>
              {p.meta}
            </Label>
            {p.story && (
              <Label
                x={x + space.xs * s}
                y={top + pad + title + space.xs * s + metaHeight + space.s * s}
                role="bodyS"
                s={s}
                color={ui.ink}
                width={inner - space.xs * s}
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
