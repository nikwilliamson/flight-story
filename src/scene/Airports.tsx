import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Mesh, ShaderMaterial } from 'three'
import { airports, currentHome, legs, visitCounts } from '../data'
import { latLonToVec3 } from '../geo'
import { palette } from '../theme'
import { useTerrain } from './terrain'
import { moveAt, timeline, visitTimes, visitsAt } from '../story/timeline'
import { distance } from '../story/distance'
import { PACING } from '../story/pacing'
import { reducedMotion } from '../motion'

const maxLog = Math.log2(1 + Math.max(...visitCounts))

/**
 * Marker sizes are authored in "pixels at the default zoom"; this converts them to globe units
 * (about 0.0024 per pixel on a 900px-tall view from the opening camera distance).
 */
const UNIT = 0.0024
/** Clearance above the terrain, enough that relief doesn't poke through the larger discs. */
const LIFT = 0.003
/** Story seconds the home ring takes to pass from the old home to the new one. */
const HANDOFF = 0.9
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1]
/** How far a puddle spreads past the disc, in marker pixels; a first visit's spreads further. */
const PUDDLE_REACH = 14
const FIRST_PUDDLE = 1.6

/** Flat decals lying on the ground: each airport is a quad in the surface's tangent plane, so it foreshortens toward the limb. */
export function Airports() {
  const terrain = useTerrain()
  const { geometry, visited, slotOf } = useMemo(() => {
    const visited = airports.map((_, i) => i).filter((i) => visitCounts[i] > 0)
    const n = visited.length * 4
    const pos = new Float32Array(n * 3)
    const corner = new Float32Array(n * 2)
    const weight = new Float32Array(n)
    const home = new Float32Array(n)
    const pulse = new Float32Array(n).fill(-1e9)
    const pulseSize = new Float32Array(n).fill(1)
    const index: number[] = []
    visited.forEach((idx, i) => {
      const a = airports[idx]
      const centre = latLonToVec3(a.lat, a.lon, terrain(a.lat, a.lon) + LIFT)
      for (let c = 0; c < 4; c++) {
        const v = i * 4 + c
        centre.toArray(pos, v * 3)
        corner.set(CORNERS.slice(c * 2, c * 2 + 2), v * 2)
        weight[v] = Math.log2(1 + visitCounts[idx]) / maxLog
        home[v] = idx === currentHome ? 1 : 0
      }
      index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3)
    })
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aCorner', new BufferAttribute(corner, 2))
    g.setAttribute('aWeight', new BufferAttribute(weight, 1))
    g.setAttribute('aHome', new BufferAttribute(home, 1))
    g.setAttribute('aPulse', new BufferAttribute(pulse, 1))
    g.setAttribute('aPulseSize', new BufferAttribute(pulseSize, 1))
    g.setIndex(index)
    const slotOf = new Int32Array(airports.length).fill(-1)
    visited.forEach((idx, i) => (slotOf[idx] = i))
    return { geometry: g, visited, slotOf }
  }, [terrain])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: {
          uShow: { value: 1 },
          uNow: { value: 0 },
          uPuddle: { value: PACING.puddle },
          uScale: { value: 1 },
          uResolutionY: { value: 900 },
          uColor: { value: palette.airport },
          uHome: { value: palette.home },
        },
        vertexShader: /* glsl */ `
          attribute vec2 aCorner;
          attribute float aWeight;
          attribute float aHome;
          attribute float aPulse;
          attribute float aPulseSize;
          uniform float uNow;
          uniform float uPuddle;
          uniform float uScale;
          uniform float uResolutionY;
          varying float vWeight;
          varying float vAge;
          varying float vPulseSize;
          varying float vHome;
          varying float vFacing;
          varying vec2 vQ;
          void main() {
            vec3 up = normalize(position);
            vec3 east = normalize(cross(abs(up.y) > 0.999 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0), up));
            vec3 north = cross(up, east);
            vAge = uNow - aPulse;
            vPulseSize = aPulseSize;
            // Room for the disc plus glow, the home ring, and a puddle while it spreads.
            float ripple = vAge >= 0.0 && vAge < uPuddle ? 8.0 + ${PUDDLE_REACH.toFixed(1)} * aPulseSize : 0.0;
            float extent = max((mix(10.0, 30.0, max(aWeight, 0.0)) + aHome * 6.0) * 0.5, ripple);
            vQ = aCorner * extent;
            // Never bigger than their nominal pixel size at their own depth: with the camera tilted toward the
            // horizon, discs near the eye would otherwise balloon into ellipses.
            vec4 centre = modelViewMatrix * vec4(position, 1.0);
            float pixel = 2.0 * -centre.z / (projectionMatrix[1][1] * uResolutionY);
            vec3 p = position + (east * vQ.x + north * vQ.y) * min(${UNIT} * uScale, pixel);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vFacing = dot(normalize(normalMatrix * up), normalize(-centre.xyz));
            vWeight = aWeight;
            vHome = aHome;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uShow;
          uniform float uPuddle;
          uniform vec3 uColor;
          uniform vec3 uHome;
          varying float vWeight;
          varying float vHome;
          varying float vFacing;
          varying vec2 vQ;
          varying float vAge;
          varying float vPulseSize;
          // Edge band at least one screen pixel wide, so foreshortened discs stay antialiased.
          float edge(float r, float radius, float soft) {
            float w = max(soft, fwidth(r) * 0.75);
            return 1.0 - smoothstep(radius - w, radius + w, r);
          }
          void main() {
            if (vWeight < 0.0) discard;   // not visited yet at the playhead
            float r = length(vQ);
            float fade = smoothstep(-0.02, 0.25, vFacing);
            // Visited airport: a flat white disc sized by visits with a crisp, pixel-wide edge (Nik: sharp, not
            // blurry), and only a faint halo for the hubs. Kept under the bloom threshold so it isn't smeared.
            // A departure or arrival flashes the disc: a little brighter and bigger, settling back over a moment.
            bool pulsing = vAge >= 0.0 && vAge < uPuddle;
            float flash = pulsing ? exp(-vAge * 5.0) : 0.0;
            float radius = mix(1.6, 4.6, vWeight);
            float disc = edge(r, radius * (1.0 + 0.25 * flash), 0.0);
            float glow = exp(-max(r - radius, 0.0) / 0.8) * 0.05 * vWeight * (1.0 - disc);
            // The orange ring below decorates the home airport's disc.
            vec3 rgb = uColor * (disc * (0.5 + 0.4 * flash) + glow);
            float a = disc + glow;
            // Home: the same disc, circled by an orange ring that keeps a fixed gap from the disc as it grows and a
            // fixed stroke width, with a faint glow.
            float ringR = radius + 2.2;
            float d = abs(r - ringR);
            float ring = (edge(d, 0.55, 0.35) + exp(-d / 1.6) * 0.18) * vHome;
            rgb = mix(rgb, uHome, ring * (1.0 - disc));
            a = max(a, ring);
            // The puddle: two thin rings spread from the disc's edge like a drop in water, easing out as they fade.
            if (pulsing) {
              float k = vAge / uPuddle;
              for (int j = 0; j < 2; j++) {
                float delay = float(j) * 0.22;
                float kj = (k - delay) / (1.0 - delay);
                if (kj <= 0.0 || kj >= 1.0) continue;
                float spread = 1.0 - (1.0 - kj) * (1.0 - kj);
                float ringAt = radius + 1.0 + ${PUDDLE_REACH.toFixed(1)} * vPulseSize * spread;
                float wave = edge(abs(r - ringAt), 0.45, 0.0) * (1.0 - kj) * (1.0 - kj) * (j == 0 ? 0.75 : 0.4);
                rgb += uColor * wave;
                a += wave;
              }
            }
            gl_FragColor = vec4(rgb * fade, a * fade) * uShow;
          }`,
      }),
    [],
  )
  const last = useMemo(() => ({ time: Number.NaN }), [])
  const mesh = useRef<Mesh>(null)
  /** Starts a puddle at an airport that a leg just left or reached at story instant k, unless one just started there. */
  const ripple = (airport: number, k: number, now: number) => {
    const slot = airport >= 0 ? slotOf[airport] : -1
    if (slot < 0) return
    const pulse = geometry.getAttribute('aPulse') as BufferAttribute
    if (now - pulse.getX(slot * 4) < PACING.puddleGap) return
    const size = visitTimes[airport][0] === k ? FIRST_PUDDLE : 1
    const pulseSize = geometry.getAttribute('aPulseSize') as BufferAttribute
    for (let c = 0; c < 4; c++) {
      pulse.setX(slot * 4 + c, now)
      pulseSize.setX(slot * 4 + c, size)
    }
    pulse.needsUpdate = true
    pulseSize.needsUpdate = true
  }
  /**
   * Puddles for every takeoff and landing the playhead passed this frame. Story instant k is when leg k takes off and
   * leg k - 1 lands. Only forward scrubbing makes them (scrubbing back un-flies legs); a fast scrub keeps the latest
   * burst, and a cut (chapter jump, the tabs) makes none.
   */
  const fire = (from: number, to: number, now: number) => {
    if (!(to > from) || to - from > PACING.puddleSkip || reducedMotion()) return
    const hi = Math.min(Math.floor(to), legs.length)
    const lo = Math.max(Math.floor(from) + 1, hi - PACING.puddleBurst + 1, 0)
    for (let k = lo; k <= hi; k++) {
      if (k < legs.length) ripple(legs[k].from, k, now)
      if (k > 0) ripple(legs[k - 1].to, k, now)
    }
  }

  useFrame(({ camera, clock, size }) => {
    const now = clock.elapsedTime
    material.uniforms.uNow.value = now
    material.uniforms.uPuddle.value = PACING.puddle
    material.uniforms.uResolutionY.value = size.height
    // Faded out and skipped entirely while the Moon shot has the screen.
    material.uniforms.uShow.value = distance.routes
    if (mesh.current) mesh.current.visible = distance.routes > 0
    // Markers are sized for the full globe; shrink them on the ground as the camera closes in so hubs stay points.
    const d = camera.position.length()
    const near = Math.min(1, Math.max(0, (d - 1.45) / 1.55))
    // Below the viewer's zoom limit (only the story flies there, for short hops) keep shrinking, so neighbouring
    // airports a few dozen miles apart stay separate dots.
    const low = Math.min(1, Math.max(0, (d - 1.2) / 0.25))
    material.uniforms.uScale.value = d >= 1.45 ? 0.4 + 0.6 * near * near * (3 - 2 * near) : 0.12 + 0.28 * low
    const { time } = timeline
    if (time === last.time) return
    fire(last.time, time, now)
    last.time = time
    // Size by visits so far, on the final scale, so hubs grow into their end size; unvisited airports hide.
    const weight = geometry.getAttribute('aWeight') as BufferAttribute
    const home = geometry.getAttribute('aHome') as BufferAttribute
    // On a move the ring fades off the old home as it rises on the new one.
    const move = moveAt(time)
    const k = Math.min(1, Math.max(0, (time - move.time) / HANDOFF))
    const handed = k * k * (3 - 2 * k)
    visited.forEach((idx, i) => {
      const visits = visitsAt(idx, time)
      const w = visits > 0 ? Math.log2(1 + visits) / maxLog : -1
      const h = visits <= 0 ? 0 : idx === move.home ? handed : idx === move.from ? 1 - handed : 0
      for (let c = 0; c < 4; c++) {
        weight.setX(i * 4 + c, w)
        home.setX(i * 4 + c, h)
      }
    })
    weight.needsUpdate = true
    home.needsUpdate = true
  })
  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={4} frustumCulled={false} />
}
