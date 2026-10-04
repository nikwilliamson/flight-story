import { forwardRef, useEffect, useMemo, useState } from 'react'
import type { Group } from 'three'
import type { CardContent } from '../story/chapters'
import { Glass } from './Glass'
import { Label } from './Label'
import { fonts } from './fonts'
import { moduleRow, textRow, type Row } from './rows'
import { ui } from './tokens'

const PADDING = 26
const MILLION = '1,000,000'

interface Props {
  chapter: CardContent
  width: number
  /** Type scale. */
  s: number
  opening?: boolean
  onHeight: (height: number) => void
}

/** One chapter's card: eyebrow, title, paragraph and modules on glass. Its parent moves it with the scroll. */
export const StoryCard = forwardRef<Group, Props>(function StoryCard({ chapter, width, s, opening, onHeight }, ref) {
  const pad = PADDING * s
  const inner = width - 2 * pad
  const rows: Row[] = useMemo(() => {
    const titleSize = (opening ? 42 : 32) * s
    const million = chapter.title.indexOf(MILLION)
    return [
      { gap: 0, height: 12 * s * 1.3, render: (y) => <Label y={y} size={12 * s} color={ui.inkDim} font={fonts.mono} letterSpacing={0.14}>{chapter.eyebrow}</Label> },
      textRow(chapter.title, {
        gap: 12 * s,
        width: inner,
        size: titleSize,
        color: ui.ink,
        font: fonts.display,
        lineHeight: 1.05,
        letterSpacing: -0.01,
        colorRanges: million >= 0 ? { 0: ui.ink, [million]: ui.international, [million + MILLION.length]: ui.ink } : undefined,
      }),
      textRow(chapter.body, { gap: 14 * s, width: inner, size: 16 * s, color: ui.inkDim }),
      ...chapter.modules.map((m) => moduleRow(m, inner, s)),
    ]
  }, [chapter, inner, s, opening])

  const [measured, setMeasured] = useState<(number | undefined)[]>([])
  const heights = rows.map((r, i) => r.height ?? measured[i])
  const tops: number[] = []
  let cursor = pad
  rows.forEach((r, i) => {
    cursor += r.gap
    tops.push(cursor)
    cursor += heights[i] ?? 0
  })
  const total = cursor + pad
  const ready = heights.every((h) => h !== undefined)
  useEffect(() => {
    if (ready) onHeight(total)
  }, [ready, total, onHeight])

  return (
    <group ref={ref} visible={false}>
      {ready && <Glass width={width} height={total} />}
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
