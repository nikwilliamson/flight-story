import type * as THREE from 'three'
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import type { Group } from 'three'
import { Glass } from './Glass'
import { type } from './tokens'

export interface Block {
  text: string
  font: string
  size: number
  color: THREE.ColorRepresentation
  /** Space above this block, px. */
  gap?: number
  letterSpacing?: number
  lineHeight?: number
  /** Character index → colour, for an accent inside a line (troika colorRanges). */
  colorRanges?: Record<number, THREE.ColorRepresentation>
}

const PADDING = 28
const INTRO_SECONDS = 1.1

/**
 * A story card drawn in the scene: glass panel plus stacked SDF text blocks. Each block reports its laid-out height
 * once troika has typeset it, and the card grows to fit. It rises and fades in when it mounts.
 */
export function Card({ x, y, width, blocks, scale = 1, anchor = 'top' }: { x: number; y: number; width: number; blocks: Block[]; scale?: number; anchor?: 'top' | 'centre' }) {
  const [heights, setHeights] = useState<number[]>(() => blocks.map(() => 0))
  const group = useRef<Group>(null)
  const born = useRef<number | null>(null)
  const padding = PADDING * scale
  const inner = width - 2 * padding

  let cursor = padding
  const placed = blocks.map((b, i) => {
    cursor += (b.gap ?? 0) * scale
    const top = cursor
    cursor += heights[i]
    return top
  })
  const height = cursor + padding
  const ready = heights.every((h) => h > 0)
  const top = anchor === 'centre' ? y - height / 2 : y

  useFrame(({ clock }) => {
    if (!group.current || !ready) return
    born.current ??= clock.elapsedTime
    const t = Math.min(1, (clock.elapsedTime - born.current) / INTRO_SECONDS)
    const ease = 1 - Math.pow(1 - t, 3)
    group.current.position.y = -(top + (1 - ease) * 24)
    group.current.visible = true
    group.current.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material & { opacity?: number; uniforms?: Record<string, { value: unknown }> }
      if (!m) return
      if (m.uniforms?.uOpacity) m.uniforms.uOpacity.value = ease
      else if ('opacity' in m) m.opacity = ease
    })
  })

  return (
    <group ref={group} position={[x, -top, 0]} visible={false}>
      <Glass width={width} height={height} />
      {blocks.map((b, i) => (
        <Text
          key={i}
          position={[padding, -placed[i], 1]}
          anchorX="left"
          anchorY="top"
          maxWidth={inner}
          font={b.font}
          fontSize={b.size * scale}
          color={b.color}
          letterSpacing={b.letterSpacing ?? 0}
          lineHeight={b.lineHeight ?? type.lineHeight}
          // troika supports colorRanges; drei passes it through but doesn't type it.
          {...({ colorRanges: b.colorRanges } as object)}
          material-transparent
          material-depthTest={false}
          onSync={(mesh) => {
            const [, minY, , maxY] = mesh.textRenderInfo?.blockBounds ?? [0, 0, 0, 0]
            const h = maxY - minY
            setHeights((prev) => (Math.abs(prev[i] - h) < 0.5 ? prev : prev.map((p, j) => (j === i ? h : p))))
          }}
        >
          {b.text}
        </Text>
      ))}
    </group>
  )
}
