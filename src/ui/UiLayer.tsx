import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useStory } from '../state/store'
import { layoutFor } from './layout'
import { Rail } from './Rail'
import { ScreenLayer } from './ScreenLayer'
import { StoryCards } from './StoryCards'
import { StoryHud } from './StoryHud'
import { JumpDrop } from './JumpDrop'
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

  return (
    <>
      {/* Phones: cards scroll in the space under the pinned globe, never over it. */}
      <ScreenLayer priority={2} clip={layout.phone ? { x: 0, y: layout.stage.height, width, height: height - layout.stage.height } : null}>
        <StoryCards layout={layout} viewport={height} />
        <TabPanel layout={layout} />
      </ScreenLayer>
      <ScreenLayer priority={3}>
        <JumpDrop />
        <TabBar layout={layout} />
        <StoryHud stage={layout.stage} s={layout.scale} />
        {!layout.phone && <Rail width={width} height={height} />}
      </ScreenLayer>
    </>
  )
}
