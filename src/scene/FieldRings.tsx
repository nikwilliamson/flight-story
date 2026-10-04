import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from 'three'
import { airports, legs } from '../data'
import { latLonToVec3 } from '../geo'
import { litAmount } from './highlight'
import { useTerrain } from './terrain'

/** Ring radius, CSS px at the ring's own depth (wireframe: 9). */
const RADIUS_PX = 9
/** Clearance above the terrain, matching the airport discs (Airports LIFT). */
const LIFT = 0.003
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1]

/** Legs that take off and land at the same field: joyrides, warbirds, the skydive. They have no arc to light. */
const sameField = legs.flatMap((l, i) => (l.from >= 0 && l.from === l.to ? [{ leg: i, airport: l.from }] : []))
const fields = [...new Set(sameField.map((s) => s.airport))]
const fieldLegs = fields.map((airport) => sameField.filter((s) => s.airport === airport).map((s) => s.leg))

const vertexShader = /* glsl */ `
  uniform float uResolutionY;
  attribute vec2 aCorner;
  attribute float aLit;
  varying float vLit;
  varying float vFacing;
  varying vec2 vQ;
  void main() {
    vLit = aLit;
    vec3 up = normalize(position);
    vec3 east = normalize(cross(abs(up.y) > 0.999 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0), up));
    vec3 north = cross(up, east);
    // Sized in screen pixels at its own depth, but lying flat on the ground like the airport discs, so it
    // foreshortens with the tilt and turns away over the limb.
    vec4 centre = modelViewMatrix * vec4(position, 1.0);
    float pixel = 2.0 * -centre.z / (projectionMatrix[1][1] * uResolutionY);
    float extent = ${RADIUS_PX.toFixed(1)} + 3.0;
    vQ = aCorner * extent;
    vec4 mv = modelViewMatrix * vec4(position + (east * vQ.x + north * vQ.y) * pixel, 1.0);
    vFacing = dot(normalize(normalMatrix * up), normalize(-centre.xyz));
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  varying float vLit;
  varying float vFacing;
  varying vec2 vQ;
  void main() {
    if (vLit < 0.002) discard;
    float d = abs(length(vQ) - ${RADIUS_PX.toFixed(1)});
    float w = max(0.8, fwidth(d));
    float ring = 1.0 - smoothstep(0.8 - w * 0.5, 0.8 + w * 0.5, d);
    // Gone over the limb, the way the airport discs go.
    float a = ring * vLit * smoothstep(-0.02, 0.25, vFacing);
    gl_FragColor = vec4(vec3(a), a);
  }
`

/**
 * A white ring on each field whose same-field legs are lit, eased with the highlight. Joyrides start and end at one
 * airport, so where other legs light up as an arc these get a ring instead (wireframe). Decals on the ground,
 * depth-tested against the globe, so they sit on the surface and hide on the far side.
 */
export function FieldRings() {
  const terrain = useTerrain()
  const size = useThree((s) => s.size)
  const geometry = useMemo(() => {
    const n = fields.length * 4
    const position = new Float32Array(n * 3)
    const corner = new Float32Array(n * 2)
    const index: number[] = []
    fields.forEach((i, k) => {
      const centre = latLonToVec3(airports[i].lat, airports[i].lon, terrain(airports[i].lat, airports[i].lon) + LIFT)
      for (let c = 0; c < 4; c++) {
        centre.toArray(position, (k * 4 + c) * 3)
        corner.set(CORNERS.slice(c * 2, c * 2 + 2), (k * 4 + c) * 2)
      }
      index.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3)
    })
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(position, 3))
    g.setAttribute('aCorner', new BufferAttribute(corner, 2))
    g.setAttribute('aLit', new BufferAttribute(new Float32Array(n), 1))
    g.setIndex(index)
    return g
  }, [terrain])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uResolutionY: { value: 1 } },
      }),
    [],
  )

  useFrame(() => {
    // Sizes are CSS px, so the resolution is the CSS height whatever the device pixel ratio.
    material.uniforms.uResolutionY.value = size.height
    const lit = geometry.getAttribute('aLit') as BufferAttribute
    let changed = false
    fieldLegs.forEach((list, k) => {
      const amount = Math.max(0, ...list.map(litAmount))
      if (lit.getX(k * 4) === amount) return
      for (let c = 0; c < 4; c++) lit.setX(k * 4 + c, amount)
      changed = true
    })
    if (changed) lit.needsUpdate = true
  })

  return <mesh geometry={geometry} material={material} renderOrder={4} frustumCulled={false} />
}
