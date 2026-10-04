import type * as THREE from 'three'
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import { CHAPTERS } from '../story/chapters'
import { scroll } from '../story/scrollState'
import { Label } from './Label'
import { fonts } from './fonts'
import { ui } from './tokens'

const SPACING = 22
/** Room kept clear above and below the rail, px. */
const MARGIN = 60

/** Chapter dots down the right edge. Hover names the chapter; click scrolls to it. Desktop only. */
export function Rail({ width, height }: { width: number; height: number }) {
  const dots = useRef<(Mesh | null)[]>([])
  const [hover, setHover] = useState(-1)
  const x = width - 26
  const spacing = Math.min(SPACING, (height - 2 * MARGIN) / (CHAPTERS.length - 1))
  const top = height / 2 - ((CHAPTERS.length - 1) * spacing) / 2

  useFrame(() => {
    dots.current.forEach((d, i) => {
      if (!d) return
      const on = i === scroll.active
      const target = on ? 1.6 : i === hover ? 1.3 : 1
      d.scale.setScalar(d.scale.x + (target - d.scale.x) * 0.2)
      ;(d.material as THREE.MeshBasicMaterial).color.copy(on ? ui.international : i < scroll.active ? ui.inkDim : ui.inkFaint)
    })
  })

  const go = (i: number) => {
    const seg = scroll.plan?.segments[i]
    if (!seg) return
    window.scrollTo({ top: seg.at + 1, behavior: 'smooth' })
  }

  return (
    <group>
      {CHAPTERS.map((c, i) => (
        <mesh
          key={c.id}
          ref={(m) => void (dots.current[i] = m)}
          position={[x, -(top + i * spacing), 2]}
          onPointerOver={() => setHover(i)}
          onPointerOut={() => setHover(-1)}
          onClick={() => go(i)}
        >
          <circleGeometry args={[3.5, 20]} />
          <meshBasicMaterial transparent depthTest={false} />
        </mesh>
      ))}
      {hover >= 0 && (
        <Label x={x - 14} y={top + hover * spacing - 7} size={11} color={ui.ink} font={fonts.mono} align="right">
          {CHAPTERS[hover].label}
        </Label>
      )}
    </group>
  )
}
