import { useMemo } from 'react'
import { Color, ShaderMaterial } from 'three'
import { ui } from './tokens'

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * A rounded glass rectangle over the globe: a dark gradient body, a fine edge that brightens toward the top (as if
 * lit by the atmosphere behind it), an optional soft outer glow and a little grain so it never reads as flat.
 */
const fragmentShader = /* glsl */ `
  uniform vec2 uSize;
  uniform float uRadius;
  uniform float uGlow;
  uniform float uFill;
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
    vec2 px = (vUv - 0.5) * (uSize + 2.0 * uGlow);
    float d = box(px, uSize * 0.5, uRadius);
    float inside = 1.0 - smoothstep(-0.5, 0.5, d);
    float top = vUv.y;
    vec3 body = uGlass * (0.85 + 0.35 * top) + (hash(gl_FragCoord.xy) - 0.5) * 0.015;
    float edge = (1.0 - smoothstep(0.0, 1.2, abs(d + 0.5))) * mix(0.12, 0.5, smoothstep(0.3, 1.0, top));
    float glow = uGlow > 0.0 ? exp(-max(d, 0.0) / (uGlow * 0.38)) * (1.0 - inside) * 0.10 : 0.0;
    vec3 color = body * inside + uEdge * (edge + glow);
    float alpha = inside * uFill + edge + glow;
    gl_FragColor = vec4(color, alpha * uOpacity);
  }
`

interface GlassProps {
  width: number
  height: number
  x?: number
  y?: number
  radius?: number
  /** Outer glow, px. */
  glow?: number
  /** Body opacity. */
  fill?: number
  color?: Color
  edge?: Color
}

/** Positioned by its top-left corner in the UI layer's px space (y down = negative). */
export function Glass({ width, height, x = 0, y = 0, radius = 14, glow = 24, fill = 0.62, color = ui.glass, edge = ui.edge }: GlassProps) {
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
          uRadius: { value: 0 },
          uGlow: { value: 0 },
          uFill: { value: 0 },
          uOpacity: { value: 1 },
          uGlass: { value: color },
          uEdge: { value: edge },
        },
      }),
    [color, edge],
  )
  const u = material.uniforms
  u.uSize.value = [width, height]
  u.uRadius.value = radius
  u.uGlow.value = glow
  u.uFill.value = fill
  return (
    <mesh material={material} position={[x + width / 2, -(y + height / 2), 0]}>
      <planeGeometry args={[width + 2 * glow, height + 2 * glow]} />
    </mesh>
  )
}
