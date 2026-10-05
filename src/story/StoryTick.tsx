import { useFrame } from '@react-three/fiber'
import { stepTabs } from '../explore/TabDriver'
import { stepHighlight } from '../scene/highlight'
import { stepScroll } from './ScrollDriver'

/**
 * The story's shared state, stepped once a frame in a fixed order before anything draws: the scroll (chapter,
 * timeline, distance, the chapter's highlight), then the tabs (whose hover and selection win at the story's end), then
 * the highlight easing everything reads. One place, so the order never depends on where components mount.
 */
export function StoryTick() {
  useFrame((_, delta) => {
    stepScroll(delta)
    stepTabs(delta)
    stepHighlight(Math.min(delta, 0.1))
  }, -1)
  return null
}
