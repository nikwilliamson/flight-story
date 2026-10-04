import { Suspense, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { palette } from '../theme'
import { Surface } from './Surface'
import { Outlines } from './Outlines'
import { Earth } from './Earth'
import { Scattering } from './Scattering'
import { Backdrop, Stars } from './Stars'
import { Arcs } from './Arcs'
import { Airports } from './Airports'
import { StoryCamera } from './camera/StoryCamera'
import { DebugHash } from '../story/debug'
import { UiLayer } from '../ui/UiLayer'
import { Moon } from './Moon'
import { DistanceTracks } from './DistanceTracks'
import { playhead } from '../story/playhead'

/** How much of the stylized glow stays under the physical layer: the night-side rim and the wide halo. */
const CLASSIC_GAIN = 0.55
const debug = typeof location !== 'undefined' ? new URLSearchParams(location.hash.slice(1)) : new URLSearchParams()

const useFullEffects = () => {
  const [full, setFull] = useState(true)
  useEffect(() => {
    setFull(!window.matchMedia('(pointer: coarse)').matches)
  }, [])
  return full
}

/**
 * Draws the globe when postprocessing is off. Any useFrame with a priority takes rendering over from R3F, and the
 * UI layer renders at priority 2, so without the composer (priority 1) something has to draw the scene first.
 */
function PlainRender() {
  useFrame(({ gl, scene, camera }) => {
    gl.autoClear = true
    gl.render(scene, camera)
  }, 1)
  return null
}

/** Advances the story playhead with the render loop. */
function StoryClock() {
  useFrame((_, delta) => playhead.tick(delta))
  return null
}

export function Globe() {
  // #trip-312 opens paused on that trip; debug #at=<seconds> on any point in the story (screenshots).
  useEffect(() => {
    const trip = /^#trip-(\d+)$/.exec(location.hash)
    if (trip) playhead.seekTrip(Number(trip[1]) - 1)
    else if (debug.has('at')) playhead.seek(Number(debug.get('at')))
  }, [])
  const fullEffects = useFullEffects()
  return (
    <Canvas
      className="globe"
      dpr={[1, 2]}
      camera={{ fov: 34, near: 0.05, far: 1000 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={(state) => {
        state.gl.setClearColor(palette.space, 1)
        // Debug: #probe exposes the camera for automated motion checks.
        if (debug.has('probe')) Object.assign(window, { __camera: state.camera })
      }}
    >
      <Backdrop />
      <Stars />
      {/* #classic shows the stylized glow alone, for comparison with the physical scattering. */}
      <Earth gain={debug.has('classic') ? 1 : CLASSIC_GAIN} />
      {!debug.has('classic') && <Scattering />}
      <Moon />
      {/* Everything that sits on the terrain waits for the elevation texture. */}
      <Suspense fallback={null}>
        <Surface />
        <Outlines />
        <Arcs />
        <Airports />
        <DistanceTracks />
      </Suspense>
      <StoryCamera />
      <DebugHash />
      {!debug.has('noui') && <UiLayer />}
      <StoryClock />
      {!(fullEffects && !debug.has('raw')) && <PlainRender />}
      {fullEffects && !debug.has('raw') && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.8} luminanceThreshold={0.62} luminanceSmoothing={0.25} radius={0.65} />
          <Vignette offset={0.32} darkness={0.72} />
        </EffectComposer>
      )}
    </Canvas>
  )
}
