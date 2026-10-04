import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, CustomBlending, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, Vector3 } from 'three'
import { sunDirection } from './light'
import { TERRAIN } from './terrain'

/**
 * Physically based single scattering, after Maxime Heckel's "On rendering the sky, sunsets, and planets": Rayleigh
 * (air molecules: blue, scatters evenly), Mie (aerosols: white, scatters forward) and an ozone layer that only
 * absorbs. Each view ray is marched through the shell; at every sample a second march toward the sun finds how much
 * light gets there (none in the planet's shadow), and Beer's law attenuates both legs. That is what puts a warm band
 * along the terminator and a bright forward-scattering glow where the sun sits behind the limb.
 *
 * Real constants, in kilometres, converted to scene units (one Earth radius). The real shell is too thin to read
 * from orbit at this size, so every height is stretched by THICKEN and every coefficient divided by it: optical depths
 * (and so the colours) stay physical while the layer gets wider on screen.
 */
const EARTH_KM = 6371
const THICKEN = 5
const KM = THICKEN / EARTH_KM
export const SCATTER_TOP = 1 + 100 * KM

const defines = {
  ATMOSPHERE: (100 * KM).toFixed(6),
  RAYLEIGH_H: (8 * KM).toFixed(6),
  MIE_H: (1.2 * KM).toFixed(6),
  OZONE_CENTER: (25 * KM).toFixed(6),
  OZONE_WIDTH: (15 * KM).toFixed(6),
}
const perUnit = EARTH_KM / THICKEN
const vec = (r: number, g: number, b: number) => `vec3(${[r, g, b].map((v) => (v * perUnit).toFixed(6)).join(', ')})`

const fragmentShader = /* glsl */ `
  #define PI 3.14159265
  const vec3 BETA_R = ${vec(0.0058, 0.0135, 0.0331)};
  const vec3 BETA_M = ${vec(0.003, 0.003, 0.003)};
  const vec3 BETA_M_EXT = ${vec(0.0033, 0.0033, 0.0033)};
  const vec3 BETA_O = ${vec(0.00065, 0.00188, 0.00008)};
  const float MIE_G = 0.76;
  // Aerosols are what turn the haze white-gray over the disc; kept to a trace so the day side stays blue.
  const float MIE_GAIN = 0.4;
  const int STEPS = 14;
  const int LIGHT_STEPS = 6;

  uniform float uGround;
  uniform float uTop;
  uniform vec3 uSun;
  uniform float uIntensity;
  uniform float uExposure;
  varying vec3 vWorld;

  vec2 sphere(vec3 ro, vec3 rd, float r) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - r * r;
    float h = b * b - c;
    if (h < 0.0) return vec2(1e9, -1e9);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
  }

  // Densities of the three ingredients at height h above the ground.
  vec3 density(float h) {
    h = max(h, 0.0);
    return vec3(exp(-h / RAYLEIGH_H), exp(-h / MIE_H), max(0.0, 1.0 - abs(h - OZONE_CENTER) / OZONE_WIDTH));
  }

  vec3 extinction(vec3 depth) {
    return BETA_R * depth.x + BETA_M_EXT * depth.y + BETA_O * depth.z;
  }

  float rayleighPhase(float mu) { return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }
  // Cornette-Shanks: Henyey-Greenstein with a (1 + mu^2) term, as in the post.
  float miePhase(float mu) {
    float gg = MIE_G * MIE_G;
    return 3.0 * (1.0 - gg) * (1.0 + mu * mu) / (8.0 * PI * (2.0 + gg) * pow(max(1.0 + gg - 2.0 * MIE_G * mu, 1e-4), 1.5));
  }

  // Optical depth from p to the sun, or -1 when the planet is in the way (p is in shadow).
  vec3 toSun(vec3 p) {
    vec2 ground = sphere(p, uSun, uGround);
    if (ground.x < ground.y && ground.y > 0.0) return vec3(-1.0);
    float len = sphere(p, uSun, uTop).y;
    vec3 depth = vec3(0.0);
    float prev = 0.0;
    // Steps bunch up near p, where the air is densest.
    for (int i = 1; i <= LIGHT_STEPS; i++) {
      float s = float(i) / float(LIGHT_STEPS);
      s = s * s * len;
      float ds = s - prev;
      depth += density(length(p + uSun * (s - 0.5 * ds)) - uGround) * ds;
      prev = s;
    }
    return depth;
  }

  // Interleaved gradient noise, to dither the 8-bit output so the long gradients do not band.
  float dither(vec2 c) { return fract(52.9829189 * fract(dot(c, vec2(0.06711056, 0.00583715)))) - 0.5; }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorld - ro);
    vec2 top = sphere(ro, rd, uTop);
    if (top.x > top.y || top.y < 0.0) discard;
    vec2 ground = sphere(ro, rd, uGround);
    bool hit = ground.x < ground.y && ground.x > 0.0;
    float t0 = max(top.x, 0.0);
    float t1 = hit ? ground.x : top.y;
    // Samples bunch up toward the densest point on the ray: the ground it lands on, or its closest approach.
    float anchor = hit ? t1 : clamp(-dot(ro, rd), t0, t1);

    float mu = dot(rd, uSun);
    vec3 view = vec3(0.0);   // optical depth from the camera to the current sample
    vec3 rayleigh = vec3(0.0);
    vec3 mie = vec3(0.0);
    // Two passes in camera order (t0 -> anchor, anchor -> t1), each with quadratic spacing that is finest at the anchor.
    for (int side = 0; side < 2; side++) {
      float span = side == 0 ? anchor - t0 : t1 - anchor;
      if (span <= 0.0) continue;
      float prev = side == 0 ? t0 : anchor;
      for (int i = 1; i <= STEPS; i++) {
        float u = float(i) / float(STEPS);
        float t = side == 0 ? anchor - span * (1.0 - u) * (1.0 - u) : anchor + span * u * u;
        float ds = t - prev;
        vec3 p = ro + rd * (t - 0.5 * ds);
        prev = t;
        vec3 d = density(length(p) - uGround) * ds;
        view += 0.5 * d;
        vec3 sun = toSun(p);
        if (sun.x >= 0.0) {
          vec3 transmit = exp(-extinction(view + sun));
          rayleigh += d.x * transmit;
          mie += d.y * transmit;
        }
        view += 0.5 * d;
      }
    }
    vec3 light = (rayleigh * BETA_R * rayleighPhase(mu) + mie * BETA_M * miePhase(mu) * MIE_GAIN) * uIntensity;
    // Filmic shoulder, so the forward-scattering glow saturates instead of clipping.
    vec3 color = 1.0 - exp(-light * uExposure);
    color += dither(gl_FragCoord.xy) / 255.0;
    // Premultiplied: what lies behind (the dotted globe, the stars) is dimmed by the air in front of it.
    vec3 transmittance = exp(-extinction(view));
    gl_FragColor = vec4(max(color, 0.0), 1.0 - dot(transmittance, vec3(1.0 / 3.0)));
  }
`

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export function Scattering() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        defines,
        side: BackSide,
        transparent: true,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        depthWrite: false,
        // The planet is analytic, so the shell is never clipped by the globe's depth.
        depthTest: false,
        uniforms: {
          uGround: { value: TERRAIN.base },
          uTop: { value: SCATTER_TOP },
          uSun: { value: new Vector3() },
          uIntensity: { value: 3.2 },
          uExposure: { value: 1.0 },
        },
      }),
    [],
  )
  useFrame(({ camera }) => sunDirection(camera, material.uniforms.uSun.value))
  // After the surface and its outlines, before the arcs and airports, so the story marks stay crisp over the haze.
  return (
    <mesh material={material} renderOrder={2.5}>
      <sphereGeometry args={[SCATTER_TOP, 128, 96]} />
    </mesh>
  )
}
