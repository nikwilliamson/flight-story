import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BackSide, ShaderMaterial, Vector3 } from 'three'
import { palette } from '../theme'
import { sunDirection } from './light'
import { TERRAIN } from './terrain'
import { noiseGlsl } from './noise'
import { QUALITY } from './quality'

/** Outer edge of the atmosphere volume; far enough out that the wide haze has faded to nothing. */
const TOP = 1.5

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/**
 * Single-scattering-style atmosphere, integrated along each view ray through the volume between the planet
 * (r = 1) and TOP. Two exponential layers: a thin dense one that makes the bright limb line, and a tall
 * thin one for the soft halo. Samples are spaced quadratically away from the densest point on the ray
 * (the surface hit, or the closest approach to the planet) so a few dozen steps resolve a 0.03-high layer.
 */
const fragmentShader = /* glsl */ `
  uniform float uTop;
  uniform float uGround;
  uniform vec3 uSun;
  uniform vec3 uLow;
  uniform vec3 uHigh;
  uniform vec3 uHalo;
  uniform float uTime;
  uniform float uGain;
  varying vec3 vWorld;
  ${noiseGlsl}

  const float H_LIMB = 0.028;
  const float H_HALO = 0.16;
  // Halved on phones (QUALITY): under the scattering this glow is only the wide soft halo, so it holds up.
  const int STEPS = ${QUALITY.glowSteps};

  // Distances along the ray to the near and far intersections with a sphere at the origin; x > y when missed.
  vec2 sphere(vec3 ro, vec3 rd, float r) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - r * r;
    float h = b * b - c;
    if (h < 0.0) return vec2(1e9, -1e9);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorld - ro);
    vec2 top = sphere(ro, rd, uTop);
    vec2 ground = sphere(ro, rd, uGround);
    bool hit = ground.x < ground.y && ground.x > 0.0;
    float t0 = max(top.x, 0.0);
    float t1 = hit ? ground.x : top.y;
    // Densest point: the surface where the ray lands, else where it passes closest to the planet.
    float anchor = hit ? t1 : clamp(-dot(ro, rd), t0, t1);

    // Muddy, uneven edge (after Singularity): one noise lookup per pixel, taken where the ray is densest, varies
    // the layer's thickness and brightness around the rim; a fixed lean makes one side heavier than the other.
    vec3 edgeDir = normalize(ro + rd * anchor);
    float wobble = fbm(edgeDir * 2.4 + vec3(0.0, uTime * 0.01, uTime * 0.006), 3);
    float lean = 0.7 + 0.6 * smoothstep(-0.6, 0.9, dot(edgeDir, uSun));
    float hLimb = H_LIMB * mix(0.8, 2.2, wobble);
    float gain = mix(0.55, 1.45, wobble) * lean;

    vec3 limb = vec3(0.0);
    vec3 halo = vec3(0.0);
    for (int side = 0; side < 2; side++) {
      float span = side == 0 ? anchor - t0 : t1 - anchor;
      float dir = side == 0 ? -1.0 : 1.0;
      if (span <= 0.0) continue;
      float prev = 0.0;
      for (int i = 1; i <= STEPS; i++) {
        float s = float(i) / float(STEPS);
        s = s * s * span;
        float ds = s - prev;
        vec3 p = ro + rd * (anchor + dir * (s - 0.5 * ds));
        prev = s;
        float r = length(p);
        float h = max(r - uGround, 0.0);
        // Day-side lean: brighter toward the key light, never fully dark on the night side.
        float lit = 0.45 + 0.55 * smoothstep(-0.35, 0.8, dot(p / r, uSun));
        float dLimb = exp(-h / hLimb) * ds;
        float dHalo = exp(-h / H_HALO) * ds;
        limb += mix(uLow, uHigh, smoothstep(0.0, 0.06, h)) * dLimb * lit;
        halo += uHalo * dHalo * lit;
      }
    }
    // Squaring the column depth sharpens the limb-to-disc contrast (about 15:1 becomes 200:1), so the night
    // side stays clear and the glow gathers into a thin bright edge, as it does seen from orbit.
    float l = max(max(limb.r, limb.g), limb.b);
    float hl = max(max(halo.r, halo.g), halo.b);
    vec3 color = (limb * l * 5.0 + halo * hl * 0.3) * gain * uGain;
    color = 1.0 - exp(-color * 1.3);
    gl_FragColor = vec4(color, 1.0);
  }
`

/** `gain` dims the stylized glow when the physical scattering layer carries the day side. */
export function Earth({ gain = 1 }: { gain?: number }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: BackSide,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        // The planet occlusion is analytic, so the volume is never clipped by the globe's depth.
        depthTest: false,
        uniforms: {
          uTop: { value: TOP },
          uTime: { value: 0 },
          uGain: { value: gain },
          // Matches the Surface sphere, so there is no gap between the haze and the lit disc.
          uGround: { value: TERRAIN.base },
          uSun: { value: new Vector3() },
          uLow: { value: palette.atmosphereLow },
          uHigh: { value: palette.atmosphere },
          uHalo: { value: palette.atmosphereHalo },
        },
      }),
    [],
  )
  useFrame(({ camera, clock }) => {
    sunDirection(camera, material.uniforms.uSun.value)
    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uGain.value = gain
  })
  return (
    <mesh material={material} renderOrder={1}>
      <sphereGeometry args={[TOP, 128, 96]} />
    </mesh>
  )
}
