import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useStory } from '../state/store'
import { layoutFor, tabBarBottom } from './layout'
import { space } from './tokens'
import { Rail } from './Rail'
import { Loader } from './Loader'
import { ScreenLayer } from './ScreenLayer'
import { StoryCards } from './StoryCards'
import { StoryHud } from './StoryHud'
import { TabPanel } from './TabPanel'

/**
 * The interface, drawn in its own screen-space scene after the globe (and after its bloom), in CSS px with the
 * origin at the top-left. Publishes the globe's stage to the store so the camera frames into the space left over.
 */
export function UiLayer() {
  const { width, height } = useThree((s) => s.size)
  const layout = useMemo(() => layoutFor(width, height), [width, height])
  useEffect(() => useStory.getState().setStage(layout.stage), [layout])
  // The readout and the rail belong to the journey (Nik): an open tab has neither.
  const journey = useStory((s) => s.tab === null)

  return (
    <>
      {/* The text dissolves as it rises into the tab bar, gone before it reaches the pills (phones: under the pinned
          globe; desktop: under the bar across the top), so cards never run behind the tabs. */}
      <ScreenLayer priority={2} fade={{ from: tabBarBottom(layout), to: tabBarBottom(layout) + space.l, bottom: space.l }}>
        <StoryCards layout={layout} viewport={height} />
        <TabPanel layout={layout} />
      </ScreenLayer>
      <ScreenLayer priority={3}>
        {journey && <StoryHud stage={layout.stage} s={layout.scale} phone={layout.phone} />}
        {journey && <Rail width={width} height={height} phone={layout.phone} />}
      </ScreenLayer>
      <ScreenLayer priority={4}>
        <Loader />
      </ScreenLayer>
    </>
  )
}
