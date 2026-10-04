import type { Shot } from '../state/store'

/**
 * One shot per story chapter, from the wireframe (scrolly-wireframe/camera-spec.md). Nik expects these to keep
 * changing, so every framing lives here and nowhere else.
 */
export const SHOTS = {
  opening: { lon: -40, lat: 28, zoom: 1.0, spin: true },
  first: { lon: 4, lat: 45, zoom: 4.2 },
  summers: { lon: 7, lat: 44, zoom: 3.0 },
  atlantic: { lon: -38, lat: 44, zoom: 1.75 },
  florida: { lon: -82, lat: 33, zoom: 2.4 },
  tour: { lon: -82, lat: 36, zoom: 2.1 },
  osaka: { lon: -172, lat: 38, zoom: 1.2 },
  hockey: { lon: -96, lat: 46, zoom: 1.9 },
  longOnes: { lon: -168, lat: -2, zoom: 1.0 },
  hopper: { lon: 172, lat: 10, zoom: 2.2 },
  peak: { lon: -30, lat: 20, zoom: 1.0 },
  joyrides: { lon: -81.2, lat: 27.4, zoom: 4.2 },
  jump: { lon: -80.8, lat: 28.5, zoom: 16 },
  airframes: { lon: -40, lat: 35, zoom: 1.0 },
  later: { lon: -40, lat: 35, zoom: 1.0 },
  stillGoing: { lon: -81.3, lat: 28.4, zoom: 1.5 },
  gone: { lon: -50, lat: 35, zoom: 1.0 },
  laps: { lon: -25, lat: 12, zoom: 0.8 },
  moon: { lon: -25, lat: 12, zoom: 0.8 },
  all: { lon: -40, lat: 25, zoom: 1.0, spin: true },
} satisfies Record<string, Shot>

export type ShotName = keyof typeof SHOTS
