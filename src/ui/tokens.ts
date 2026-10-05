import { Color } from 'three'
import { fonts } from './fonts'

/**
 * The interface's one source of truth: the scene's UI reads these directly, and the HTML reads the same values as CSS
 * custom properties (cssTokens.ts). Shares its hues with the globe (theme.ts).
 *
 * Colour has one meaning each: ink is text, white (ink) is lit or selected, as on the globe; amber is the one accent
 * (the million, the home marker, fun facts), never a state; cyan and amber as route colours appear only where they
 * describe a route.
 */
export const ui = {
  ink: new Color('#e6eefb'),
  inkDim: new Color('#8ea3c2'),
  inkFaint: new Color('#4f6283'),
  accent: new Color('#ffb54a'),
  domestic: new Color('#4cc9ff'),
  international: new Color('#ffb54a'),
  helicopter: new Color('#ff6fd8'),
  glass: new Color('#081020'),
  chip: new Color('#0f2340'),
  edge: new Color('#6fb6ff'),
} as const

export interface TypeRole {
  font: string
  /** CSS family for the HTML (the same files, registered in cssTokens.ts). */
  family: string
  size: number
  line: number
  tracking: number
  upper?: boolean
}

const display = (size: number, line: number, tracking = 0): TypeRole => ({ font: fonts.display, family: 'Story Display', size, line, tracking })
const displayMedium = (size: number, line: number): TypeRole => ({ font: fonts.displayMedium, family: 'Story Display', size, line, tracking: 0 })

/** Eight roles, CSS px before the phone scale. Nothing sets a size outside these. */
export const type: Record<'displayXL' | 'displayL' | 'displayM' | 'displayS' | 'body' | 'bodyS' | 'monoData' | 'monoLabel', TypeRole> = {
  displayXL: display(44, 1.05, -0.01),
  displayL: display(32, 1.05, -0.01),
  displayM: displayMedium(22, 1.1),
  displayS: displayMedium(16, 1.2),
  body: { font: fonts.body, family: 'Story Body', size: 16, line: 1.45, tracking: 0 },
  bodyS: { font: fonts.body, family: 'Story Body', size: 14, line: 1.4, tracking: 0 },
  monoData: { font: fonts.mono, family: 'Story Mono', size: 12, line: 1.4, tracking: 0 },
  monoLabel: { font: fonts.mono, family: 'Story Mono', size: 10.5, line: 1.3, tracking: 0.12, upper: true },
}

export type Role = keyof typeof type

/** Spacing steps, px. */
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const

export const radius = { panel: 16, inner: 8 } as const

/** Component sizes, px: a list row, a two-line row (label over detail), and the two pills. */
export const size = { row: 28, rowDetail: 44, rank: 28, pill: 32, pillS: 28 } as const

/** The glass every panel shares, in the scene (Glass.tsx) and in HTML (.glass). */
export const glass = { fill: 0.62, glow: 24 } as const
