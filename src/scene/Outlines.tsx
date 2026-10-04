import { useEffect, useMemo, useState } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from 'three'
import outlinesUrl from '../assets/outlines.bin?url'
import { latLonToVec3 } from '../geo'
import { palette } from '../theme'
import { useTerrain, type TerrainRadius } from './terrain'

/** Height above the terrain, enough to clear it along a segment's chord. */
const CLEARANCE = 0.0015

/** Natural Earth 110m coastlines and country borders, packed by scripts/build_outlines.py. */
async function loadOutlines(terrain: TerrainRadius): Promise<BufferGeometry> {
  const view = new DataView(await (await fetch(outlinesUrl)).arrayBuffer())
  const coast = view.getUint32(0, true)
  const total = coast + view.getUint32(4, true)
  const position = new Float32Array(total * 6)
  const border = new Float32Array(total * 2)
  for (let i = 0; i < total; i++) {
    const o = 8 + i * 8
    for (let e = 0; e < 2; e++) {
      const lat = view.getInt16(o + e * 4, true) / 180
      const lon = view.getInt16(o + e * 4 + 2, true) / 90
      latLonToVec3(lat, lon, terrain(lat, lon) + CLEARANCE).toArray(position, i * 6 + e * 3)
    }
    border[i * 2] = border[i * 2 + 1] = i >= coast ? 1 : 0
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('aBorder', new BufferAttribute(border, 1))
  return geometry
}

const vertexShader = /* glsl */ `
  attribute float aBorder;
  varying float vBorder;
  varying float vFacing;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFacing = dot(normalize(normalMatrix * position), normalize(-mv.xyz));
    vBorder = aBorder;
    gl_Position = projectionMatrix * mv;
  }
`

/** Thin illuminated lines: coastlines carry the shapes, borders sit quieter. */
const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vBorder;
  varying float vFacing;
  void main() {
    float a = mix(0.16, 0.05, vBorder) * smoothstep(0.0, 0.3, vFacing);
    gl_FragColor = vec4(uColor * a, a);
  }
`

export function Outlines() {
  const terrain = useTerrain()
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null)
  useEffect(() => {
    let cancelled = false
    loadOutlines(terrain).then((g) => {
      if (!cancelled) setGeometry(g)
    })
    return () => {
      cancelled = true
    }
  }, [terrain])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uColor: { value: palette.outline } },
      }),
    [],
  )
  if (!geometry) return null
  return <lineSegments geometry={geometry} material={material} renderOrder={2} />
}
