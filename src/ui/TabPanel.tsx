import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import { atEnd } from '../explore/explore'
import { panelFor } from '../explore/panels'
import { useStory } from '../state/store'
import { tabBarBottom, type Layout } from './layout'
import { space } from './tokens'
import { StoryCard } from './StoryCard'
import { panelScroll, resetPanelScroll, stepPanelScroll, usePanelScrollInput } from './panelScroll'

/** The open tab's card, in the story card's place: under the tab bar on desktop, under the globe on phones. */
export function TabPanel({ layout }: { layout: Layout }) {
  const tab = useStory((s) => s.tab)
  const ref = useRef<Group>(null)
  const content = useMemo(() => (tab && tab !== 'log' ? panelFor(tab, layout.phone) : null), [tab, layout.phone])
  const y = tabBarBottom(layout) + space.l
  const viewport = useThree((s) => s.size.height)
  const height = useRef(0)
  usePanelScrollInput()
  // Each tab opens at its top; a taller panel than the room under the tab bar scrolls by the difference.
  useEffect(() => resetPanelScroll(), [tab])
  const fit = useCallback(() => void (panelScroll.max = Math.max(0, height.current - (viewport - y - space.l))), [viewport, y])
  useEffect(fit, [fit])
  const onHeight = useCallback((h: number) => {
    height.current = h
    fit()
  }, [fit])

  useFrame((_, delta) => {
    stepPanelScroll(delta)
    const g = ref.current
    if (!g) return
    // A "Show all" sheet covers the panel; hide it so it never shows through the glass.
    g.visible = atEnd() && !useStory.getState().sheet
    g.position.set(layout.card.x, -(y - panelScroll.offset), 0)
  })

  if (!content) return null
  return <StoryCard key={tab} ref={ref} chapter={content} width={layout.card.width} s={layout.scale} bare={layout.phone} onHeight={onHeight} />
}
