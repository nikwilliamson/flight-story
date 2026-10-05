import { Text } from '@react-three/drei'
import { Color, type ColorRepresentation } from 'three'
import { type, type Role } from './tokens'

export interface LabelProps {
  children: string
  x?: number
  y?: number
  /** A type role (tokens.ts): its font, size, line height, tracking and case. */
  role: Role
  /** Layout scale for the role's size (phones). */
  s?: number
  /** Overrides the role's size, for the few things sized to fit a box (the nights grid). */
  size?: number
  color: ColorRepresentation
  width?: number
  align?: 'left' | 'right' | 'center'
  /** One line, cut with an ellipsis-free clip when too long (ranked names, table cells). */
  nowrap?: boolean
  colorRanges?: Record<number, ColorRepresentation>
  /** Called with the laid-out height once troika has typeset the text. */
  onHeight?: (height: number) => void
}

/**
 * Plain hex, never a shared Color: when a Color prop changes, R3F copies the new value *into* the object the text
 * already holds, which would repaint the shared token (a lit row turning every inkFaint label amber).
 */
const hex = (c: ColorRepresentation) => (c instanceof Color ? c.getHex() : c)

/** SDF text in the UI layer's px space, anchored at its top-left (or top-right for align right). */
export function Label({ children, x = 0, y = 0, role, s = 1, size, color, width, align = 'left', nowrap, colorRanges, onHeight }: LabelProps) {
  const r = type[role]
  return (
    <Text
      position={[x, -y, 1]}
      anchorX={align}
      anchorY="top"
      textAlign={align}
      maxWidth={nowrap ? undefined : width}
      whiteSpace={nowrap ? 'nowrap' : 'normal'}
      clipRect={nowrap && width ? [align === 'right' ? -width : 0, -1e4, align === 'right' ? 0 : width, 1e4] : undefined}
      font={r.font}
      fontSize={size ?? r.size * s}
      color={hex(color)}
      letterSpacing={r.tracking}
      lineHeight={r.line}
      material-transparent
      material-depthTest={false}
      // troika supports colorRanges; drei passes it through but doesn't type it.
      {...({ colorRanges: colorRanges && Object.fromEntries(Object.entries(colorRanges).map(([k, v]) => [k, hex(v)])) } as object)}
      onSync={
        onHeight &&
        ((mesh) => {
          const [, minY, , maxY] = mesh.textRenderInfo?.blockBounds ?? [0, 0, 0, 0]
          onHeight(maxY - minY)
        })
      }
    >
      {r.upper ? children.toUpperCase() : children}
    </Text>
  )
}
