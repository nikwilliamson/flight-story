import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { CHAPTERS } from '../story/chapters'
import { scrollOf } from '../story/pacing'
import { cardTop, planScroll } from '../story/scrollPlan'
import { setPlan } from '../story/scrollState'
import { tabBarBottom, type Layout } from './layout'
import { StoryCard } from './StoryCard'
import { useStory } from '../state/store'

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
  // Phones pin cards in the strip under the pinned globe; desktop keeps them under the always-on tab bar.
  const top = layout.phone ? layout.card.y : tabBarBottom(layout) + 8
  const column = { top, bottom: layout.phone ? viewport - 16 : viewport, centre: !layout.phone }

  const plan = useMemo(() => {
    if (CHAPTERS.some((_, i) => heights[i] === undefined)) return null
    return planScroll(CHAPTERS.map((ch, i) => ({ height: heights[i]!, scroll: scrollOf(ch) * viewport })), column)
    // column is derived from layout and viewport
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heights, viewport, layout])

  useEffect(() => {
    setPlan(plan)
    const spacer = document.getElementById('scroll-spacer')
    if (spacer && plan) spacer.style.height = `${Math.ceil(plan.length + viewport)}px`
  }, [plan, viewport])

  useFrame(() => {
    if (!plan) return
    const y = window.scrollY
    // Once a tab is open, its panel takes the cards' place.
    const tabOpen = useStory.getState().tab !== null
    plan.segments.forEach((seg, i) => {
      const g = groups.current[i]
      if (!g) return
      const top = cardTop(seg, y)
      g.position.set(layout.card.x, -top, 0)
      g.visible = top < viewport && top + seg.height > 0 && !tabOpen
    })
  })

  return (
    <>
      {CHAPTERS.map((chapter, i) => (
        <StoryCard key={chapter.id} ref={(g) => void (groups.current[i] = g)} chapter={chapter} width={layout.card.width} s={layout.scale} bare={layout.phone} opening={i === 0} onHeight={onHeight[i]} />
      ))}
    </>
  )
}
