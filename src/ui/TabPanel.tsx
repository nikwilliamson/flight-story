import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { atEnd } from '../explore/explore'
import { panelFor } from '../explore/panels'
import { useStory } from '../state/store'
import type { Layout } from './layout'
import { StoryCard } from './StoryCard'
import { tabBarBottom } from './TabBar'

const noop = () => {}

/** The open tab's card, in the story card's place: under the tab bar on desktop, under the globe on phones. */
export function TabPanel({ layout }: { layout: Layout }) {
  const tab = useStory((s) => s.tab)
  const ref = useRef<Group>(null)
  const content = useMemo(() => (tab && tab !== 'log' ? panelFor(tab, layout.phone) : null), [tab, layout.phone])
  const y = layout.phone ? layout.card.y : tabBarBottom(layout) + 16

  useFrame(() => {
    const g = ref.current
    if (!g) return
    // A "Show all" sheet covers the panel; hide it so it never shows through the glass.
    g.visible = atEnd() && !useStory.getState().sheet
    g.position.set(layout.card.x, -y, 0)
  })

  if (!content) return null
  return <StoryCard key={tab} ref={ref} chapter={content} width={layout.card.width} s={layout.scale} onHeight={noop} />
}
