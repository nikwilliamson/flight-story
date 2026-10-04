import { Text } from '@react-three/drei'
import type { ColorRepresentation } from 'three'
import { fonts } from './fonts'
import { type } from './tokens'

export interface LabelProps {
  children: string
  x?: number
  y?: number
  size: number
  color: ColorRepresentation
  font?: string
  width?: number
  align?: 'left' | 'right' | 'center'
  letterSpacing?: number
  lineHeight?: number
  /** One line, cut with an ellipsis-free clip when too long (ranked names, table cells). */
  nowrap?: boolean
  colorRanges?: Record<number, ColorRepresentation>
  /** Called with the laid-out height once troika has typeset the text. */
  onHeight?: (height: number) => void
}

/** SDF text in the UI layer's px space, anchored at its top-left (or top-right for align right). */
export function Label({ children, x = 0, y = 0, size, color, font = fonts.body, width, align = 'left', letterSpacing = 0, lineHeight = type.lineHeight, nowrap, colorRanges, onHeight }: LabelProps) {
  return (
    <Text
      position={[x, -y, 1]}
      anchorX={align}
      anchorY="top"
      textAlign={align}
      maxWidth={nowrap ? undefined : width}
      whiteSpace={nowrap ? 'nowrap' : 'normal'}
      clipRect={nowrap && width ? [align === 'right' ? -width : 0, -1e4, align === 'right' ? 0 : width, 1e4] : undefined}
      font={font}
      fontSize={size}
      color={color}
      letterSpacing={letterSpacing}
      lineHeight={lineHeight}
      material-transparent
      material-depthTest={false}
      // troika supports colorRanges; drei passes it through but doesn't type it.
      {...({ colorRanges } as object)}
      onSync={
        onHeight &&
        ((mesh) => {
          const [, minY, , maxY] = mesh.textRenderInfo?.blockBounds ?? [0, 0, 0, 0]
          onHeight(maxY - minY)
        })
      }
    >
      {children}
    </Text>
  )
}
