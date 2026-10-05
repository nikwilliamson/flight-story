import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useStory } from '../state/store'
import { layoutFor } from './layout'
import { Rail } from './Rail'
import { Loader } from './Loader'
import { ScreenLayer } from './ScreenLayer'
import { StoryCards } from './StoryCards'
import { StoryHud } from './StoryHud'
import { TabBar } from './TabBar'
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
      {/* Phones: the text scrolls in the space under the pinned globe and dissolves into it as it rises. */}
      <ScreenLayer priority={2} fade={layout.phone ? { from: layout.stage.height - 56, to: layout.stage.height + 40, bottom: 20 } : null}>
        <StoryCards layout={layout} viewport={height} />
        <TabPanel layout={layout} />
      </ScreenLayer>
      <ScreenLayer priority={3}>
        <TabBar layout={layout} />
        {journey && <StoryHud stage={layout.stage} s={layout.scale} phone={layout.phone} />}
        {journey && <Rail width={width} height={height} phone={layout.phone} />}
      </ScreenLayer>
      <ScreenLayer priority={4}>
        <Loader />
      </ScreenLayer>
    </>
  )
}
