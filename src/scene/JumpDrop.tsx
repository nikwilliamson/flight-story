import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, ShaderMaterial } from 'three'
import { airports } from '../data'
import { latLonToVec3 } from '../geo'
import { CHAPTERS } from '../story/chapters'
import { jump, jumpPhase } from '../story/jump'
import { scroll } from '../story/scrollState'
import { useTerrain } from './terrain'

/** How far above the drop zone the fall starts, CSS px at the drop zone's depth (wireframe: 90). */
const FALL_PX = 90
/** Dash and gap, CSS px. */
const DASH = 2
const GAP = 5
const LINE_PX = 1.6
const HEAD_PX = 3

const zone = airports.findIndex((a) => a.code === 'X21')

const vertexShader = /* glsl */ `
  uniform float uResolutionY;
  uniform float uLength;
  uniform float uFallen;
  attribute float aT;
  attribute float aSide;
  attribute float aHead;
  varying float vPx;
  varying float vAcross;
  varying vec2 vHead;
  varying float vFacing;
  void main() {
    vec3 up = normalize(position);
    vec4 ground = modelViewMatrix * vec4(position, 1.0);
    float pixel = 2.0 * -ground.z / (projectionMatrix[1][1] * uResolutionY);
    // Straight up from the ground along the surface normal: the line hangs over the drop zone in the scene, so the
    // tilted close-up sees it fall rather than a flat overlay.
    float height = uLength * pixel;
    float headAt = height * (1.0 - uFallen);
    vec4 mv;
    if (aHead > 0.5) {
      mv = modelViewMatrix * vec4(position + up * headAt, 1.0);
      vHead = vec2(aT, aSide) * ${(HEAD_PX + 1).toFixed(1)};
      mv.xy += vHead * pixel;
    } else {
      vec4 a = modelViewMatrix * vec4(position + up * mix(headAt, height, aT), 1.0);
      vec3 dir = normalize((modelViewMatrix * vec4(up, 0.0)).xyz);
      vec3 side = normalize(cross(dir, normalize(-a.xyz)));
      mv = a + vec4(side * aSide * (${LINE_PX.toFixed(1)} + 1.0) * 0.5 * pixel, 0.0);
      vHead = vec2(1e3);
    }
    vPx = mix(headAt, height, aT) / pixel;
    vAcross = aSide;
    vFacing = dot(normalize(normalMatrix * up), normalize(-ground.xyz));
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uShow;
  varying float vPx;
  varying float vAcross;
  varying vec2 vHead;
  varying float vFacing;
  void main() {
    float a;
    if (vHead.x < 1e2) {
      float r = length(vHead);
      a = 1.0 - smoothstep(${HEAD_PX.toFixed(1)} - 0.6, ${HEAD_PX.toFixed(1)} + 0.6, r);
    } else {
      float dash = step(fract(vPx / ${(DASH + GAP).toFixed(1)}), ${(DASH / (DASH + GAP)).toFixed(3)});
      float edge = clamp((1.0 - abs(vAcross)) * (${LINE_PX.toFixed(1)} + 1.0) * 0.5 + 0.25, 0.0, 1.0);
      a = dash * edge;
    }
    a *= uShow * smoothstep(-0.02, 0.25, vFacing);
    gl_FragColor = vec4(vec3(a), a);
  }
`

/**
 * After the door flash, a dashed white line falls onto the drop zone (wireframe drawDrop), where the field ring
 * marks the landing. In the scene, anchored to the ground and depth-tested like the airports, so it never floats
 * and hides with the globe's far side.
 */
export function JumpDrop() {
  const terrain = useTerrain()
  const size = useThree((s) => s.size)
  const group = useRef<Group>(null)
  const { geometry, material } = useMemo(() => {
    const base = zone >= 0 ? latLonToVec3(airports[zone].lat, airports[zone].lon, terrain(airports[zone].lat, airports[zone].lon) + 0.003) : null
    // Line: a two-vertex-wide strip from the head (t 0) to the top (t 1). Head: a quad round the falling tip.
    const t = [0, 0, 1, 1, -1, 1, 1, -1]
    const side = [-1, 1, -1, 1, -1, -1, 1, 1]
    const head = [0, 0, 0, 0, 1, 1, 1, 1]
    const g = new BufferGeometry()
    const position = new Float32Array(8 * 3)
    for (let v = 0; v < 8; v++) base?.toArray(position, v * 3)
    g.setAttribute('position', new BufferAttribute(position, 3))
    g.setAttribute('aT', new BufferAttribute(new Float32Array(t), 1))
    g.setAttribute('aSide', new BufferAttribute(new Float32Array(side), 1))
    g.setAttribute('aHead', new BufferAttribute(new Float32Array(head), 1))
    g.setIndex([0, 1, 2, 1, 3, 2, 4, 5, 6, 4, 6, 7])
    const m = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uResolutionY: { value: 1 }, uLength: { value: FALL_PX }, uFallen: { value: 0 }, uShow: { value: 0 } },
    })
    return { geometry: base ? g : null, material: m }
  }, [terrain])

  useFrame(() => {
    const g = group.current
    if (!g || !geometry) return
    const { drop } = jumpPhase(jump.progress)
    // Only during the jump: past it the clock rests at its end, drop included.
    g.visible = !!CHAPTERS[scroll.active]?.jump && drop > 0
    material.uniforms.uResolutionY.value = size.height
    material.uniforms.uFallen.value = drop
    material.uniforms.uShow.value = 1
  })

  if (!geometry) return null
  return (
    <group ref={group} visible={false}>
      <mesh geometry={geometry} material={material} renderOrder={5} frustumCulled={false} />
    </group>
  )
}
