import type { Color } from 'three'
import { palette } from '../theme'
import type { Layout } from './layout'
import { Label } from './Label'
import { RAIL_PHONE_SCALE, RAIL_REACH } from './Rail'
import { hudBottom } from './StoryHud'
import { space, type, ui } from './tokens'

interface Entry {
  label: string
  color: Color
  /** By land is drawn dashed on the globe, so its key is too. */
  dashed?: boolean
}

const ENTRIES: Entry[] = [
  { label: 'Domestic', color: ui.domestic },
  { label: 'International', color: ui.international },
  { label: 'Helicopter', color: ui.helicopter },
  { label: 'By land', color: palette.ground, dashed: true },
]

/** Swatch length and thickness, px. */
const SWATCH = 16
const THICK = 2
const DASHES = 3
const noRaycast = () => null

function Swatch({ x, y, s, entry }: { x: number; y: number; s: number; entry: Entry }) {
  const length = SWATCH * s
  const pieces = entry.dashed ? DASHES : 1
  const piece = entry.dashed ? length / (pieces * 2 - 1) : length
  return (
    <>
      {Array.from({ length: pieces }, (_, k) => (
        <mesh key={k} position={[x - length + piece * (2 * k + 0.5), -y, 0]} raycast={noRaycast}>
          <planeGeometry args={[piece, THICK]} />
          <meshBasicMaterial color={entry.color} transparent opacity={0.9} depthTest={false} depthWrite={false} />
        </mesh>
      ))}
    </>
  )
}

/**
 * What the route colours mean (Nik). Right-aligned with the readout: under it on phones (or in its place while a tab
 * is open), at the foot of the globe's stage on desktop, clear of the selection card on the left.
 */
export function RouteLegend({ layout, height, journey }: { layout: Layout; height: number; journey: boolean }) {
  const { stage, scale: s, phone } = layout
  const row = type.monoLabel.size * type.monoLabel.line * s + space.xs * s
  const x = stage.x + stage.width - RAIL_REACH * (phone ? RAIL_PHONE_SCALE : 1) - space.l * s
  const top = phone ? (journey ? hudBottom(stage, s) : stage.y + space.l * s) : Math.min(height, stage.y + stage.height) - space.xl * s - row * ENTRIES.length
  const gap = space.s * s
  return (
    <group>
      {ENTRIES.map((entry, i) => {
        const y = top + row * i
        return (
          <group key={entry.label}>
            <Swatch x={x} y={y + (type.monoLabel.size * type.monoLabel.line * s) / 2} s={s} entry={entry} />
            <Label x={x - SWATCH * s - gap} y={y} role="monoLabel" s={s} color={ui.inkDim} align="right">
              {entry.label}
            </Label>
          </group>
        )
      })}
    </group>
  )
}
