import { Suspense, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { latLonToVec3 } from '../geo'
import { palette } from '../theme'
import { Surface } from './Surface'
import { Outlines } from './Outlines'
import { Earth } from './Earth'
import { Scattering } from './Scattering'
import { Backdrop, Stars } from './Stars'
import { Arcs } from './Arcs'
import { Airports } from './Airports'
import { CameraFit, NEAR_LIMIT } from './CameraFit'
import { Moon } from './Moon'
import { DistanceTracks } from './DistanceTracks'
import { playhead, usePlayheadValue } from '../story/playhead'

/** Opening view: over the Atlantic so the US, Europe and South America share the frame. */
const CAMERA_DISTANCE = 4.4
const START = latLonToVec3(30, -52, CAMERA_DISTANCE)
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

/** Advances the story playhead with the render loop. */
function StoryClock() {
  useFrame((_, delta) => playhead.tick(delta))
  return null
}

export function Globe() {
  const playing = usePlayheadValue((s) => s.playing)
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
      camera={{ position: (debug.has('lat') ? latLonToVec3(+debug.get('lat')!, +debug.get('lon')!, CAMERA_DISTANCE) : START).toArray(), fov: 34, near: 0.05, far: 1000 }}
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
      <CameraFit />
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.45}
        minDistance={NEAR_LIMIT}
        maxDistance={10}
        autoRotate={!debug.has('still') && !playing}
        autoRotateSpeed={0.18}
        makeDefault
      />
      <StoryClock />
      {fullEffects && !debug.has('raw') && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.8} luminanceThreshold={0.62} luminanceSmoothing={0.25} radius={0.65} />
          <Vignette offset={0.32} darkness={0.72} />
        </EffectComposer>
      )}
    </Canvas>
  )
}
