import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { CHAPTERS } from '../story/chapters'
import { cardTop, planScroll } from '../story/scrollPlan'
import { scroll } from '../story/scrollState'
import type { Layout } from './layout'
import { StoryCard } from './StoryCard'

/**
 * Every chapter card, laid out once their text has been measured, then moved with the page scroll each frame.
 * The page itself is an empty scroll spacer under the canvas, so phones keep native momentum scrolling.
 */
export function StoryCards({ layout, viewport }: { layout: Layout; viewport: number }) {
  const groups = useRef<(Group | null)[]>([])
  const [heights, setHeights] = useState<(number | undefined)[]>([])
  const onHeight = useMemo(
    () => CHAPTERS.map((_, i) => (h: number) => setHeights((prev) => (prev[i] === h ? prev : Object.assign([...prev], { [i]: h })))),
    [],
  )
  const column = layout.phone ? { top: layout.card.y, bottom: viewport - 16, centre: false } : { top: 0, bottom: viewport, centre: true }

  const plan = useMemo(() => {
    if (CHAPTERS.some((_, i) => heights[i] === undefined)) return null
    return planScroll(CHAPTERS.map((c, i) => ({ height: heights[i]!, travel: c.travel })), viewport, column)
    // column is derived from layout and viewport
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heights, viewport, layout])

  useEffect(() => {
    scroll.plan = plan
    const spacer = document.getElementById('scroll-spacer')
    if (spacer && plan) spacer.style.height = `${Math.ceil(plan.length + viewport)}px`
  }, [plan, viewport])

  useFrame(() => {
    if (!plan) return
    const y = window.scrollY
    plan.segments.forEach((seg, i) => {
      const g = groups.current[i]
      if (!g) return
      const top = cardTop(seg, y, viewport)
      g.position.set(layout.card.x, -top, 0)
      g.visible = top < viewport && top + seg.height > 0
    })
  })

  return (
    <>
      {CHAPTERS.map((chapter, i) => (
        <StoryCard key={chapter.id} ref={(g) => void (groups.current[i] = g)} chapter={chapter} width={layout.card.width} s={layout.scale} opening={i === 0} onHeight={onHeight[i]} />
      ))}
    </>
  )
}
