import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import { reducedMotion } from '../motion'
import { palette } from '../theme'
import { Label } from './Label'
import { fonts } from './fonts'
import { ui } from './tokens'

const BAR = 180
/** Seconds the cover takes to lift once everything is in. */
const LIFT = 0.9
/** Seconds after which the cover lifts whatever the loads say. */
const SAFETY = 12
const noRaycast = () => null

/**
 * The loading screen, drawn in the scene like everything else: the title and a thin line filling as the globe's
 * textures arrive, over a cover that lifts to reveal the globe once they have. Shown once per visit.
 */
export function Loader() {
  const { width, height } = useThree((s) => s.size)
  const { active, progress } = useProgress()
  const cover = useRef<Mesh>(null)
  const fill = useRef<Mesh>(null)
  const group = useRef<Group>(null)
  const marks = useRef<Group>(null)
  const state = useRef({ shown: 0, gone: 0, waited: 0 }).current

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    state.shown += (progress / 100 - state.shown) * (1 - Math.exp(-dt * 8))
    state.waited += dt
    // Done when the loads settle; the safety net lifts it anyway if the loading manager never reports.
    const done = (!active && progress >= 100 && state.shown > 0.98) || state.waited > SAFETY
    if (done || state.gone > 0) state.gone = reducedMotion() ? 1 : Math.min(1, state.gone + dt / LIFT)
    const g = group.current
    if (!g) return
    g.visible = state.gone < 1
    ;(cover.current!.material as MeshBasicMaterial).opacity = 1 - state.gone * state.gone * (3 - 2 * state.gone)
    fill.current!.scale.x = Math.max(0.001, state.shown)
    fill.current!.position.x = width / 2 - BAR / 2 + (BAR * state.shown) / 2
    // The title and line step away as the cover starts to lift (troika text has no opacity to fade).
    marks.current!.visible = state.gone === 0
  })

  const y = height / 2
  return (
    <group ref={group}>
      <mesh ref={cover} position={[width / 2, -height / 2, 0]} raycast={noRaycast}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={palette.space} transparent depthTest={false} depthWrite={false} />
      </mesh>
      <group ref={marks}>
        <Label x={width / 2} y={y - 44} size={Math.min(28, width / 16)} color={ui.ink} font={fonts.display} align="center">
          Steve's journey to 1,000,000 and more
        </Label>
        <mesh position={[width / 2, -(y + 6), 1]} raycast={noRaycast}>
          <planeGeometry args={[BAR, 1]} />
          <meshBasicMaterial color={ui.inkFaint} transparent opacity={0.35} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh ref={fill} position={[width / 2 - BAR / 2, -(y + 6), 1]} raycast={noRaycast}>
          <planeGeometry args={[BAR, 1.5]} />
          <meshBasicMaterial color={ui.international} transparent depthTest={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}
