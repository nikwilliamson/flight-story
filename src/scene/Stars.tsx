import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, ShaderMaterial, type Points } from 'three'
import { palette } from '../theme'

const COUNT = 5200

/** Deterministic so the sky doesn't reshuffle on reload. */
function rand(seed: number) {
  const x = Math.sin(seed * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export function Stars() {
  const geometry = useMemo(() => {
    const pos = new Float32Array(COUNT * 3)
    const mag = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      const u = rand(i) * 2 - 1
      const t = rand(i + 0.31) * Math.PI * 2
      const r = 40 + rand(i + 0.67) * 40
      const s = Math.sqrt(1 - u * u)
      pos.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t)], i * 3)
      mag[i] = Math.pow(rand(i + 0.13), 4)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aMag', new BufferAttribute(mag, 1))
    return g
  }, [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute float aMag;
          varying float vMag;
          void main() {
            vMag = aMag;
            gl_PointSize = 0.8 + aMag * 2.6;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying float vMag;
          void main() {
            float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * (0.18 + 0.7 * vMag);
            gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * a, a);
          }`,
      }),
    [],
  )
  // The sky travels with the camera, so pulling back to the Moon never flies through it.
  const ref = useRef<Points>(null)
  useFrame(({ camera }) => ref.current?.position.copy(camera.position))
  return <points ref={ref} geometry={geometry} material={material} renderOrder={-1} frustumCulled={false} />
}

/** A faint blue bloom of light behind the globe, as if it sits in its own glow. */
export function Backdrop() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        transparent: true,
        blending: AdditiveBlending,
        uniforms: { uColor: { value: palette.atmosphere } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying vec3 vDir;
          void main() {
            // cameraPosition is world space; the backdrop point straight behind the globe glows most.
            float behind = max(dot(vDir, -normalize(cameraPosition)), 0.0);
            // Sized for the globe filling the view; it fades as the camera pulls back toward the Moon.
            float near = 1.0 - smoothstep(8.0, 16.0, length(cameraPosition));
            float glow = (pow(behind, 30.0) * 0.16 + pow(behind, 4.0) * 0.03) * near;
            gl_FragColor = vec4(uColor * glow, glow);
          }`,
      }),
    [],
  )
  return (
    <mesh material={material} renderOrder={-2}>
      <sphereGeometry args={[90, 48, 32]} />
    </mesh>
  )
}

const DUST = 700

/**
 * A sparse layer of faint motes between the globe and the stars, fixed in space: as the camera swings between shots
 * they slide past against the far sky, which gives the moves depth. Gone before the camera pulls out to the Moon,
 * so it never flies through them.
 */
export function Dust() {
  const geometry = useMemo(() => {
    const pos = new Float32Array(DUST * 3)
    const mag = new Float32Array(DUST)
    for (let i = 0; i < DUST; i++) {
      const u = rand(i + 0.91) * 2 - 1
      const t = rand(i + 0.47) * Math.PI * 2
      const r = 5 + rand(i + 0.29) * 9
      const s = Math.sqrt(1 - u * u)
      pos.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t)], i * 3)
      mag[i] = rand(i + 0.77)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aMag', new BufferAttribute(mag, 1))
    return g
  }, [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uShow: { value: 1 } },
        vertexShader: /* glsl */ `
          attribute float aMag;
          varying float vMag;
          void main() {
            vMag = aMag;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = 1.0 + aMag * 1.2;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uShow;
          varying float vMag;
          void main() {
            float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * (0.06 + 0.12 * vMag) * uShow;
            gl_FragColor = vec4(vec3(0.7, 0.82, 1.0) * a, a);
          }`,
      }),
    [],
  )
  const ref = useRef<Points>(null)
  useFrame(({ camera }) => {
    // Fades as the eye nears the layer (it starts at 5) so nothing pops past the lens.
    const show = 1 - Math.min(1, Math.max(0, (camera.position.length() - 3.6) / 1.2))
    material.uniforms.uShow.value = show
    if (ref.current) ref.current.visible = show > 0
  })
  return <points ref={ref} geometry={geometry} material={material} renderOrder={-1} frustumCulled={false} />
}
