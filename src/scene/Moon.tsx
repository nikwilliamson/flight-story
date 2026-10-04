import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { ShaderMaterial, Vector3 } from 'three'
import { MOON_POSITION, MOON_RADIUS } from '../story/distance'
import { noiseGlsl } from './noise'

const MOON_LIGHT = new Vector3(-0.65, 0.35, 0.55).normalize()

/**
 * The Moon at true size and distance from the Earth (1 unit = one Earth radius). Its surface is procedural: dark
 * maria from low-frequency noise, brighter highlands, and a scatter of small bright craters, lit by the same key
 * light as the globe.
 */
export function Moon() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uSun: { value: new Vector3() } },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          varying vec3 vLocal;
          void main() {
            vLocal = normalize(position);
            vNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uSun;
          varying vec3 vNormal;
          varying vec3 vLocal;
          ${noiseGlsl}
          vec3 hash3(vec3 c) {
            c = vec3(dot(c, vec3(127.1, 311.7, 74.7)), dot(c, vec3(269.5, 183.3, 246.1)), dot(c, vec3(113.5, 271.9, 124.6)));
            return fract(sin(c) * 43758.5453);
          }
          // Round craters on a jittered grid: a bowl inside each crater's radius and a raised rim just outside it.
          float craters(vec3 p, float scale) {
            vec3 q = p * scale;
            vec3 cell = floor(q);
            float h = 0.0;
            for (int i = -1; i <= 1; i++)
            for (int j = -1; j <= 1; j++)
            for (int k = -1; k <= 1; k++) {
              vec3 c = cell + vec3(float(i), float(j), float(k));
              vec3 r = hash3(c);
              float radius = 0.12 + 0.3 * r.x * r.x;
              float d = length(q - c - r) / radius;
              if (r.y > 0.55 || d > 1.5) continue;
              h += d < 1.0 ? (d * d - 1.0) : 0.35 * exp(-(d - 1.0) * (d - 1.0) * 14.0);
            }
            return h;
          }
          float height(vec3 p) {
            return fbm(p * 2.2, 4) * 0.4 + craters(p, 4.0) * 0.4 + craters(p + 3.7, 11.0) * 0.18 + craters(p + 9.1, 29.0) * 0.07;
          }
          void main() {
            vec3 p = vLocal;
            // Maria: the dark lava plains, about a third of the face.
            float maria = smoothstep(0.05, 0.3, snoise(p * 1.1 + 3.1) * 0.7 + snoise(p * 2.9 + 1.7) * 0.25 + snoise(p * 7.0) * 0.08);
            float albedo = mix(0.62, 0.24, maria) * (0.85 + 0.15 * fbm(p * 11.0, 3));
            // Young craters throw bright ejecta.
            albedo += 0.1 * pow(max(snoise(p * 19.0 + 4.0), 0.0), 6.0);
            // Bump-map the height for relief along the terminator.
            vec3 n = normalize(vNormal);
            vec3 t1 = normalize(cross(abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), n));
            vec3 t2 = cross(n, t1);
            float e = 0.002;
            float h = height(p);
            vec3 local1 = normalize(cross(abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), p));
            vec3 local2 = cross(p, local1);
            float dx = (height(normalize(p + local1 * e)) - h) / e;
            float dy = (height(normalize(p + local2 * e)) - h) / e;
            vec3 bumped = normalize(n - (t1 * dx + t2 * dy) * 0.02);
            float lit = max(dot(bumped, uSun), 0.0);
            // The Moon's face barely darkens toward the edge (it reflects back toward the light), so keep it flat-lit.
            vec3 rgb = vec3(0.97, 0.95, 0.91) * albedo * (lit * 1.1 + 0.012);
            gl_FragColor = vec4(rgb, 1.0);
          }`,
      }),
    [],
  )
  // Lit from beside the camera (upper left) so it reads as a waxing gibbous Moon, not the globe's backlit rim.
  useFrame(({ camera }) => material.uniforms.uSun.value.copy(MOON_LIGHT).transformDirection(camera.matrixWorld))
  return (
    <mesh position={MOON_POSITION} material={material}>
      <sphereGeometry args={[MOON_RADIUS, 96, 64]} />
    </mesh>
  )
}
