import { useMemo, useState, type ReactNode } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { Scene } from 'three'
import type { Stage } from '../state/store'

/**
 * A screen-space scene drawn on top of everything rendered at a lower priority, in CSS px with the origin at the
 * top-left (y down the screen is negative y). Like drei's Hud, plus an optional clip rectangle: on phones the story
 * cards scroll inside the space under the pinned globe instead of over it.
 */
export function ScreenLayer({ priority, clip, children }: { priority: number; clip?: Stage | null; children: ReactNode }) {
  const gl = useThree((s) => s.gl)
  const { width, height } = useThree((s) => s.size)
  const [scene] = useState(() => new Scene())
  const camera = useMemo(() => ({ left: 0, right: width, top: 0, bottom: -height }), [width, height])

  useFrame(() => {
    const cam = scene.userData.camera
    if (!cam) return
    gl.autoClear = false
    gl.clearDepth()
    if (clip) {
      gl.setScissorTest(true)
      // setScissor takes CSS px from the bottom-left and applies the pixel ratio itself.
      gl.setScissor(clip.x, height - clip.y - clip.height, clip.width, clip.height)
    }
    gl.render(scene, cam)
    if (clip) gl.setScissorTest(false)
  }, priority)

  return createPortal(
    <>
      <OrthographicCamera
        ref={(c) => void (scene.userData.camera = c)}
        makeDefault
        {...camera}
        near={-100}
        far={100}
        position={[0, 0, 10]}
      />
      {children}
    </>,
    scene,
    { events: { priority: priority + 1 } },
  )
}
