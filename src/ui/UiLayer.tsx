import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Hud, OrthographicCamera } from '@react-three/drei'
import { facts, fmt } from '../data/facts'
import { useStory } from '../state/store'
import { Card, type Block } from './Card'
import { fonts } from './fonts'
import { layoutFor } from './layout'
import { type, ui } from './tokens'

const TITLE = "Steve's journey to 1,000,000 and more"

/**
 * The interface, drawn in its own screen-space scene after the globe (and after its bloom), in CSS px with the
 * origin at the top-left. Publishes the globe's stage to the store so the camera frames into the space left over.
 */
export function UiLayer() {
  const { width, height } = useThree((s) => s.size)
  const layout = useMemo(() => layoutFor(width, height), [width, height])
  useEffect(() => useStory.getState().setStage(layout.stage), [layout])

  const opening: Block[] = useMemo(
    () => [
      { text: '1965–2025', font: fonts.mono, size: type.eyebrow, color: ui.inkDim, letterSpacing: 0.14 },
      {
        text: TITLE,
        font: fonts.display,
        size: type.title,
        color: ui.ink,
        gap: 14,
        lineHeight: 1.05,
        letterSpacing: -0.01,
        colorRanges: { 0: ui.ink, [TITLE.indexOf('1,000,000')]: ui.international, [TITLE.indexOf(' and more')]: ui.ink },
      },
      {
        text: `Sixty years of flying, logged by hand, one row per leg. Steve has gone round the Earth ${fmt(facts.laps)} times, or to the Moon and back ${fmt(facts.moonTrips, 1)} times. Scroll to fly them in order.`,
        font: fonts.body,
        size: type.body,
        color: ui.inkDim,
        gap: 18,
      },
    ],
    [],
  )

  return (
    <Hud renderPriority={2}>
      {/* Pixel units, origin top-left, y down the screen as negative y. */}
      <OrthographicCamera makeDefault left={0} right={width} top={0} bottom={-height} near={-100} far={100} position={[0, 0, 10]} />
      <Card
        x={layout.card.x}
        y={layout.phone ? layout.card.y : height / 2}
        anchor={layout.phone ? 'top' : 'centre'}
        width={layout.card.width}
        blocks={opening}
        scale={layout.scale}
      />
    </Hud>
  )
}
