import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh, MeshBasicMaterial } from 'three'
import { reducedMotion } from '../motion'
import { useStory } from '../state/store'
import { scrollTop } from '../story/scrollState'
import type { Layout } from './layout'
import { Label, setOpacity } from './Label'
import { space, type, ui } from './tokens'

/** Length of the cue's track, px, and seconds for the bead to run it. */
const TRACK = 28
const RUN_S = 1.8
/** Scroll, px, over which the cue fades once the reader starts. */
const FADE_PX = 160
const noRaycast = () => null

/**
 * "Scroll" under the opening, with a bead running down a short track: there only on the landing view, gone as soon as
 * the reader scrolls, and back if they return to the top.
 */
export function ScrollCue({ layout, width, height }: { layout: Layout; width: number; height: number }) {
  const label = useRef<Mesh>(null)
  const track = useRef<Mesh>(null)
  const bead = useRef<Mesh>(null)
  const state = useRef({ shown: 0 }).current
  const s = layout.scale
  // Desktop: centred under the globe's stage. Phones: the bottom of the screen, under the opening card.
  const x = layout.phone ? width / 2 : layout.stage.x + layout.stage.width / 2
  const bottom = (layout.phone ? height : layout.stage.y + layout.stage.height) - space.xxl * s
  const labelY = bottom - TRACK * s - space.s * s - type.monoLabel.size * type.monoLabel.line * s

  useFrame(({ clock }, delta) => {
    const { ready, tab } = useStory.getState()
    const wanted = ready && tab === null ? Math.max(0, 1 - scrollTop() / FADE_PX) : 0
    state.shown += (wanted - state.shown) * Math.min(1, delta * 3)
    const k = reducedMotion() ? 0.5 : (clock.elapsedTime % RUN_S) / RUN_S
    setOpacity(label.current, state.shown * 0.85)
    ;(track.current!.material as MeshBasicMaterial).opacity = state.shown * 0.25
    ;(bead.current!.material as MeshBasicMaterial).opacity = state.shown * Math.sin(Math.PI * k)
    bead.current!.position.y = -(bottom - TRACK * s + TRACK * s * k)
    const visible = state.shown > 0.01
    label.current!.visible = track.current!.visible = bead.current!.visible = visible
  })

  return (
    <group>
      <Label ref={label} x={x} y={labelY} role="monoLabel" s={s} color={ui.inkDim} align="center" opacity={0}>
        Scroll
      </Label>
      <mesh ref={track} position={[x, -(bottom - (TRACK * s) / 2), 1]} raycast={noRaycast}>
        <planeGeometry args={[1, TRACK * s]} />
        <meshBasicMaterial color={ui.ink} transparent opacity={0} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={bead} position={[x, 0, 1]} raycast={noRaycast}>
        <circleGeometry args={[2 * s, 16]} />
        <meshBasicMaterial color={ui.ink} transparent opacity={0} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  )
}
