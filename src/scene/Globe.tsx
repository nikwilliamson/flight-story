import { Suspense, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { PerformanceMonitor } from '@react-three/drei'
import { hashParams } from '../hash'
import { palette } from '../theme'
import { Surface } from './Surface'
import { Outlines } from './Outlines'
import { Earth } from './Earth'
import { Scattering } from './Scattering'
import { Backdrop, Dust, Stars } from './Stars'
import { Arcs } from './Arcs'
import { Airports } from './Airports'
import { camera as storyCamera, StoryCamera } from './camera/StoryCamera'
import { DistanceCamera } from './camera/DistanceCamera'
import { timeline } from '../story/timeline'
import { scroll } from '../story/scrollState'
import { DebugHash } from '../story/debug'
import { ScrollDriver } from '../story/ScrollDriver'
import { TabDriver } from '../explore/TabDriver'
import { StoryTick } from '../story/StoryTick'
import { useStory } from '../state/store'
import { UiLayer } from '../ui/UiLayer'
import { Moon } from './Moon'
import { DistanceTracks } from './DistanceTracks'
import { FieldRings } from './FieldRings'
import { JumpDrop } from './JumpDrop'
import { JumpLayer } from './JumpLayer'

/** How much of the stylized glow stays under the physical layer: the night-side rim and the wide halo. */
const CLASSIC_GAIN = 0.55

/** Bloom and vignette on fine pointers only. Decided before the first render, so phones never build the composer. */
const fullEffects = typeof matchMedia !== 'undefined' && !matchMedia('(pointer: coarse)').matches

/**
 * Draws the globe when postprocessing is off. Any useFrame with a priority takes rendering over from R3F, and the
 * UI layers render at priorities 2 and 3, so without the composer (priority 1) something has to draw the scene first.
 */
function PlainRender() {
  useFrame(({ gl, scene, camera }) => {
    gl.autoClear = true
    gl.render(scene, camera)
  }, 1)
  return null
}

/** Phones start a little under full sharpness: the shaders are fill-rate bound and 3× screens pay for every pixel. */
const startDpr = () => Math.min(window.devicePixelRatio, window.matchMedia('(pointer: coarse)').matches ? 1.5 : 2)

export function Globe() {
  const [dpr, setDpr] = useState(startDpr)
  return (
    <Canvas
      className="globe"
      dpr={dpr}
      // No tone mapping anywhere: the composer turns it off on desktop, so phones (no composer) match by leaving it off too.
      flat
      camera={{ fov: 34, near: 0.05, far: 1000 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={(state) => {
        state.gl.setClearColor(palette.space, 1)
        // iOS drops WebGL contexts under memory pressure; the scene can't rebuild itself, so offer a reload.
        state.gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          useStory.getState().setFailed('lost')
        })
        // Debug: #probe exposes the camera for automated motion checks.
        if (hashParams.has('probe')) Object.assign(window, { __camera: state.camera, __timeline: timeline, __scroll: scroll, __cam: storyCamera, __story: useStory })
      }}
    >
      {/* Holds the frame budget: drops the resolution when frames run long, raises it back when there's headroom. */}
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => setDpr((d) => Math.max(1, d - 0.25))}
        onIncline={() => setDpr((d) => Math.min(startDpr(), d + 0.25))}
        onFallback={() => setDpr(1)}
      />
      <Backdrop />
      <Stars />
      <Dust />
      {/* #classic shows the stylized glow alone, for comparison with the physical scattering. */}
      <Earth gain={hashParams.has('classic') ? 1 : CLASSIC_GAIN} />
      {!hashParams.has('classic') && <Scattering />}
      <Moon />
      {/* Everything that sits on the terrain waits for the elevation texture. */}
      <Suspense fallback={null}>
        <Surface />
        <Outlines />
        <Arcs />
        <Airports />
        <FieldRings />
        <JumpDrop />
        <DistanceTracks />
      </Suspense>
      <JumpLayer />
      <StoryCamera />
      {/* After the story camera: it blends over it for the distance section. */}
      <DistanceCamera />
      <DebugHash />
      <ScrollDriver />
      <TabDriver />
      <StoryTick />
      {!hashParams.has('noui') && <UiLayer />}
      {!(fullEffects && !hashParams.has('raw')) && <PlainRender />}
      {fullEffects && !hashParams.has('raw') && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.8} luminanceThreshold={0.72} luminanceSmoothing={0.25} radius={0.65} />
          <Vignette offset={0.32} darkness={0.72} />
        </EffectComposer>
      )}
    </Canvas>
  )
}
