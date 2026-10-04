import { useMemo } from 'react'
import { ShaderMaterial } from 'three'
import { ui } from './tokens'

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * A glass card over the globe: a rounded rectangle with a dark gradient body, a fine edge that brightens toward
 * the top (as if lit by the atmosphere behind it), a soft outer glow and a little grain so it never reads as flat.
 */
const fragmentShader = /* glsl */ `
  uniform vec2 uSize;
  uniform float uRadius;
  uniform float uOpacity;
  uniform vec3 uGlass;
  uniform vec3 uEdge;
  varying vec2 vUv;
  float box(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    // The quad is GLOW px bigger than the card on every side, for the outer glow.
    const float GLOW = 24.0;
    vec2 px = (vUv - 0.5) * (uSize + 2.0 * GLOW);
    float d = box(px, uSize * 0.5, uRadius);
    float inside = 1.0 - smoothstep(-0.5, 0.5, d);
    float top = vUv.y;
    vec3 body = uGlass * (0.85 + 0.35 * top) + (hash(gl_FragCoord.xy) - 0.5) * 0.015;
    float edge = (1.0 - smoothstep(0.0, 1.2, abs(d + 0.5))) * mix(0.12, 0.5, smoothstep(0.3, 1.0, top));
    float glow = exp(-max(d, 0.0) / 9.0) * (1.0 - inside) * 0.10;
    vec3 color = body * inside + uEdge * (edge + glow);
    float alpha = inside * 0.62 + edge + glow;
    gl_FragColor = vec4(color, alpha * uOpacity);
  }
`

const GLOW = 24

export function Glass({ width, height, opacity = 1, radius = 14 }: { width: number; height: number; opacity?: number; radius?: number }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uSize: { value: [0, 0] },
          uRadius: { value: radius },
          uOpacity: { value: 1 },
          uGlass: { value: ui.glass },
          uEdge: { value: ui.edge },
        },
      }),
    [radius],
  )
  material.uniforms.uSize.value = [width, height]
  material.uniforms.uOpacity.value = opacity
  return (
    <mesh material={material} position={[width / 2, -height / 2, 0]}>
      <planeGeometry args={[width + 2 * GLOW, height + 2 * GLOW]} />
    </mesh>
  )
}
