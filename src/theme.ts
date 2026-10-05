import { Color } from 'three'

/** Shader-side palette; mirrors the CSS tokens in styles.css. */
export const palette = {
  space: new Color('#03060d'),
  ocean: new Color('#050b18'),
  grid: new Color('#16305a'),
  shelf: new Color('#0b1d3a'),
  outline: new Color('#8cc4ff'),
  relief: new Color('#3d6fb8'),
  /** Warm sodium-white city lights (Nik: warmer). */
  lights: new Color('#ffe9cf'),
  airport: new Color('#f4f8ff'),
  /** Routes outside a lit set drain toward this, so the white of the set reads against grey. */
  slate: new Color('#3a4a66'),
  domestic: new Color('#4cc9ff'),
  international: new Color('#ffb54a'),
  helicopter: new Color('#5dff8a'),
  home: new Color('#ffb54a'),
  atmosphere: new Color('#2f6bff'),
  atmosphereLow: new Color('#8fd4ff'),
  atmosphereHalo: new Color('#1d3f9e'),
  haze: new Color('#9cc8ff'),
  fog: new Color('#01040b'),
  ground: new Color('#cfe6ff'),
} as const
