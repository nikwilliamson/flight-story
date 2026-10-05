import { useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import { reducedMotion } from '../motion'
import { useStory } from '../state/store'
import { palette } from '../theme'
import { Label, setOpacity } from './Label'
import { openingTitle, titleRanges } from './opening'
import { scrollTop } from '../story/scrollState'
import { hashParams, shareIdOf } from '../hash'
import { space, ui } from './tokens'

const BAR = 180
/** Seconds the cover takes to lift once everything is in. */
const LIFT = 0.9
/** Seconds after which the cover lifts whatever the loads say. */
const SAFETY = 12
const noRaycast = () => null
/** Seconds to wait for the opening card's layout before falling back to a centred title. */
const CUT_WAIT = 1.5
const TITLE = "Steve's journey to 1,000,000 and more"
/** A link straight into a chapter or a tab doesn't land on the opening card, so there's nothing to cut to. */
const cuts = !hashParams.has('ch') && !shareIdOf(location.hash)

type Place = { x: number; y: number; width: number; s: number } | 'centre' | null

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
  const bar = useRef<Group>(null)
  const title = useRef<Mesh>(null)
  const state = useRef({ shown: 0, gone: 0, started: performance.now() }).current
  // The title waits for the opening card to be laid out, then appears exactly where the card's own title is.
  const [place, setPlace] = useState<Place>(null)
  const [titleHeight, setTitleHeight] = useState(0)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    state.shown += (progress / 100 - state.shown) * (1 - Math.exp(-dt * 8))
    // Done when the loads settle; the safety net (wall clock, so a slow GPU's long frames don't stretch it) lifts it
    // anyway if the loading manager never reports.
    const done = (!active && progress >= 100 && state.shown > 0.98) || performance.now() - state.started > SAFETY * 1000
    if ((done || state.gone > 0) && state.gone === 0) useStory.getState().setReady()
    if (done || state.gone > 0) state.gone = reducedMotion() ? 1 : Math.min(1, state.gone + dt / LIFT)
    if (!place) {
      const waited = performance.now() - state.started > CUT_WAIT * 1000
      if (cuts && openingTitle.known && scrollTop() === 0) setPlace({ x: openingTitle.x, y: openingTitle.y, width: openingTitle.width, s: openingTitle.s })
      else if (waited || !cuts) setPlace('centre')
    }
    const g = group.current
    if (!g) return
    g.visible = state.gone < 1
    ;(cover.current!.material as MeshBasicMaterial).opacity = 1 - state.gone * state.gone * (3 - 2 * state.gone)
    fill.current!.scale.x = Math.max(0.001, state.shown)
    fill.current!.position.x = width / 2 - BAR / 2 + (BAR * state.shown) / 2
    // The line steps away as the cover lifts. Cut to the card, the title stays put as the card comes up around it;
    // centred, it fades with the cover.
    bar.current!.visible = state.gone === 0 && (place === 'centre' || titleHeight > 0)
    marks.current!.visible = place !== null
    // The HTML card fades in over the same spot as the cover lifts, so the scene's copy of the title fades out with it.
    setOpacity(title.current, 1 - state.gone)
  })

  const y = height / 2
  const titleSize = width < 600 ? 26 : 28
  return (
    <group ref={group}>
      <mesh ref={cover} position={[width / 2, -height / 2, 0]} raycast={noRaycast}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={palette.space} transparent depthTest={false} depthWrite={false} />
      </mesh>
      <group ref={marks} visible={false}>
        {place === 'centre' ? (
          // Narrow screens wrap the title onto two lines, raised by one so it still clears the bar.
          <Label ref={title} x={width / 2} y={y - 44 - (width < 600 ? titleSize * 1.1 : 0)} role="displayL" size={titleSize} width={width - 48} color={ui.ink} align="center" colorRanges={titleRanges(TITLE)}>
            {TITLE}
          </Label>
        ) : (
          place && (
            <Label ref={title} x={place.x} y={place.y} role="displayXL" s={place.s} width={place.width} color={ui.ink} colorRanges={titleRanges(TITLE)} onHeight={setTitleHeight}>
              {TITLE}
            </Label>
          )
        )}
        <group ref={bar} position={place && place !== 'centre' ? [place.x + BAR / 2 - width / 2, -(place.y + titleHeight + space.xl * place.s - y - 6), 0] : [0, 0, 0]}>
          <mesh position={[width / 2, -(y + 6), 1]} raycast={noRaycast}>
            <planeGeometry args={[BAR, 1]} />
            <meshBasicMaterial color={ui.inkFaint} transparent opacity={0.35} depthTest={false} depthWrite={false} />
          </mesh>
          <mesh ref={fill} position={[width / 2 - BAR / 2, -(y + 6), 1]} raycast={noRaycast}>
            <planeGeometry args={[BAR, 1.5]} />
            <meshBasicMaterial color={ui.accent} transparent depthTest={false} depthWrite={false} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
