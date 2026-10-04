import { Color } from 'three'

/** Interface palette, drawn in the scene. Shares its hues with the globe (theme.ts). */
export const ui = {
  ink: new Color('#e6eefb'),
  inkDim: new Color('#8ea3c2'),
  inkFaint: new Color('#4f6283'),
  domestic: new Color('#4cc9ff'),
  international: new Color('#ffb54a'),
  glass: new Color('#081020'),
  edge: new Color('#6fb6ff'),
} as const

/** Type scale in CSS px; the layout multiplies by its own scale on small screens. */
export const type = {
  eyebrow: 12,
  title: 44,
  body: 17,
  lineHeight: 1.45,
} as const
