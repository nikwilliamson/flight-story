import { useEffect, useMemo } from 'react'
import { ShaderMaterial } from 'three'
import { palette } from '../theme'
import { useThree } from '@react-three/fiber'
import { useStory } from '../state/store'
import { layoutFor, tabBarBottom } from './layout'
import { space } from './tokens'
import { Rail } from './Rail'
import { RouteLegend } from './RouteLegend'
import { GlobeLabels } from './GlobeLabels'
import { ScrollCue } from './ScrollCue'
import { SelectionCard } from './SelectionCard'
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
        {layout.phone && <Scrim top={tabBarBottom(layout)} width={width} height={height} />}
        <StoryCards layout={layout} viewport={height} />
        <TabPanel layout={layout} />
      </ScreenLayer>
      <ScreenLayer priority={3}>
        {journey && <StoryHud stage={layout.stage} s={layout.scale} phone={layout.phone} />}
        {journey && <Rail width={width} height={height} phone={layout.phone} />}
        <RouteLegend layout={layout} height={height} journey={journey} />
        <ScrollCue layout={layout} width={width} height={height} />
        <GlobeLabels layout={layout} />
        <SelectionCard layout={layout} width={width} />
      </ScreenLayer>
      <ScreenLayer priority={4}>
        <Loader />
      </ScreenLayer>
    </>
  )
}

/** Rises over this many px from the tab bar, then holds. */
const SCRIM_RISE = 140
const SCRIM_ALPHA = 0.86
const noRaycast = () => null

/**
 * Phones: the globe runs on under the card strip, and a bright close-up (the jump, Florida at night) washed out the
 * text set straight on it (Nik). A veil of the page's own dark rises from the tab bar, so the cards stay bare but read.
 */
function Scrim({ top, width, height }: { top: number; width: number; height: number }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: { uColor: { value: palette.space }, uRise: { value: SCRIM_RISE / Math.max(1, height - top) } },
        vertexShader: /* glsl */ `
          varying float vY;
          void main() {
            vY = 0.5 - position.y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uRise;
          varying float vY;
          void main() {
            float a = smoothstep(0.0, uRise, vY) * ${SCRIM_ALPHA.toFixed(2)};
            gl_FragColor = vec4(uColor * a, a);
          }`,
      }),
    [top, height],
  )
  const h = height - top
  return (
    <mesh position={[width / 2, -(top + h / 2), -1]} scale={[width, h, 1]} material={material} raycast={noRaycast} renderOrder={-1}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}
