import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from 'three'
import { airports, legs } from '../data'
import { latLonToVec3 } from '../geo'
import { litAmount } from './highlight'
import { useTerrain } from './terrain'

/** Ring radius on screen, CSS px (wireframe: 9). */
const RADIUS_PX = 9

/** Legs that take off and land at the same field: joyrides, warbirds, the skydive. They have no arc to light. */
const sameField = legs.flatMap((l, i) => (l.from >= 0 && l.from === l.to ? [{ leg: i, airport: l.from }] : []))
const fields = [...new Set(sameField.map((s) => s.airport))]
const fieldLegs = fields.map((airport) => sameField.filter((s) => s.airport === airport).map((s) => s.leg))

const vertexShader = /* glsl */ `
  uniform float uSize;
  attribute float aLit;
  varying float vLit;
  void main() {
    vLit = aLit;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aLit > 0.002 ? uSize : 0.0;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uWidth;
  varying float vLit;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float ring = smoothstep(uWidth, 0.0, abs(r - 0.82));
    gl_FragColor = vec4(vec3(ring * vLit), ring * vLit);
  }
`

/**
 * A white ring on each field whose same-field legs are lit, eased with the highlight. Joyrides start and end at one
 * airport, so where other legs light up as an arc these get a ring instead (wireframe).
 */
export function FieldRings() {
  const terrain = useTerrain()
  const dpr = useThree((s) => s.viewport.dpr)
  const geometry = useMemo(() => {
    const position = new Float32Array(fields.length * 3)
    fields.forEach((i, k) => latLonToVec3(airports[i].lat, airports[i].lon, terrain(airports[i].lat, airports[i].lon) + 0.004).toArray(position, k * 3))
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(position, 3))
    g.setAttribute('aLit', new BufferAttribute(new Float32Array(fields.length), 1))
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
        uniforms: { uSize: { value: 1 }, uWidth: { value: 0.1 } },
      }),
    [],
  )

  useFrame(() => {
    const size = (RADIUS_PX / 0.82) * 2 * dpr
    material.uniforms.uSize.value = size
    // About 1.6 px of line whatever the point size.
    material.uniforms.uWidth.value = (1.6 * dpr * 2) / size
    const lit = geometry.getAttribute('aLit') as BufferAttribute
    let changed = false
    fieldLegs.forEach((list, k) => {
      const amount = Math.max(0, ...list.map(litAmount))
      if (lit.getX(k) !== amount) {
        lit.setX(k, amount)
        changed = true
      }
    })
    if (changed) lit.needsUpdate = true
  })

  return <points geometry={geometry} material={material} renderOrder={4} frustumCulled={false} />
}
