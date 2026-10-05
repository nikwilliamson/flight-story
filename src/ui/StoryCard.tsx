import { forwardRef, useEffect, useMemo, useState } from 'react'
import type { Group } from 'three'
import type { CardContent } from '../story/chapters'
import { Glass } from './Glass'
import { Label } from './Label'
import { moduleRow, textRow, type Row } from './rows'
import { space, type, ui } from './tokens'

const PADDING = space.xl
const MILLION = '1,000,000'

/** The title's colours: the million in the accent. The loader draws the opening title with the same ones. */
export function titleRanges(title: string) {
  const million = title.indexOf(MILLION)
  return million >= 0 ? { 0: ui.ink, [million]: ui.accent, [million + MILLION.length]: ui.ink } : undefined
}

/**
 * Where the opening card's title sits on screen once laid out (known), so the loader can draw it in the same place
 * and lift away around it: the match cut from the loading screen into the story.
 */
export const openingTitle = { known: false, x: 0, y: 0, width: 0, s: 1, dx: 0, dy: 0 }

interface Props {
  chapter: CardContent
  width: number
  /** Type scale. */
  s: number
  opening?: boolean
  /** No glass container, only a little vertical breathing room (phones: the text sits straight on the scene). */
  bare?: boolean
  onHeight: (height: number) => void
}

/** One chapter's card: eyebrow, title, paragraph and modules on glass. Its parent moves it with the scroll. */
export const StoryCard = forwardRef<Group, Props>(function StoryCard({ chapter, width, s, opening, bare, onHeight }, ref) {
  const pad = bare ? 0 : PADDING * s
  const inner = width - 2 * pad
  const rows: Row[] = useMemo(() => {
    return [
      { gap: 0, height: type.monoLabel.size * type.monoLabel.line * s, render: (y) => <Label y={y} role="monoLabel" s={s} color={ui.inkDim}>{chapter.eyebrow}</Label> },
      textRow(chapter.title, {
        gap: space.m * s,
        width: inner,
        role: opening ? 'displayXL' : 'displayL',
        s,
        color: ui.ink,
        colorRanges: titleRanges(chapter.title),
      }),
      textRow(chapter.body, { gap: space.l * s, width: inner, role: 'body', s, color: ui.inkDim }),
      ...chapter.modules.map((m) => moduleRow(m, inner, s)),
    ]
  }, [chapter, inner, s, opening])

  const [measured, setMeasured] = useState<(number | undefined)[]>([])
  const heights = rows.map((r, i) => r.height ?? measured[i])
  const tops: number[] = []
  let cursor = bare ? space.m * s : pad
  rows.forEach((r, i) => {
    cursor += r.gap
    tops.push(cursor)
    cursor += heights[i] ?? 0
  })
  const total = cursor + (bare ? space.m * s : pad)
  const ready = heights.every((h) => h !== undefined)
  if (opening) Object.assign(openingTitle, { dx: pad, dy: tops[1], width: inner, s })
  useEffect(() => {
    if (ready) onHeight(total)
  }, [ready, total, onHeight])

  return (
    <group ref={ref} visible={false}>
      {ready && !bare && <Glass width={width} height={total} />}
      <group position={[pad, 0, 0]}>
        {rows.map((r, i) => (
          <group key={i}>
            {r.render(tops[i], (h) => setMeasured((prev) => (Math.abs((prev[i] ?? -1) - h) < 0.5 ? prev : Object.assign([...prev], { [i]: h }))))}
          </group>
        ))}
      </group>
    </group>
  )
})
