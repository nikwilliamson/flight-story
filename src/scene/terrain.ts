import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import topoUrl from '../assets/topo_2048.png'

/**
 * Exaggerated relief, in globe radii. Real relief is ~0.0014 R at Everest; RELIEF is about three times that so
 * mountain ranges read at globe scale. Shared by the Surface shader (GLSL below) and the CPU sampler, so
 * airports, arcs, labels and outlines sit on the same ground the shader draws.
 */
export const TERRAIN = {
  base: 0.995,
  land: 0.001,
  relief: 0.004,
  ocean: 0.004,
} as const

/** Height above TERRAIN.base from a topo texel (R = sqrt-mapped land elevation, G = sqrt-mapped ocean depth). */
export const terrainGlsl = /* glsl */ `
  float terrainHeight(vec3 topo) {
    float land = smoothstep(6.0 / 255.0, 10.0 / 255.0, topo.r);
    float e = clamp((topo.r * 255.0 - 8.0) / 247.0, 0.0, 1.0);
    // e is sqrt(elevation / 6 km); e^1.6 sits between linear and sqrt, so plateaus lift without flattening peaks.
    return land * (${TERRAIN.land.toFixed(5)} + ${TERRAIN.relief.toFixed(5)} * pow(e, 1.6))
      - (1.0 - land) * ${TERRAIN.ocean.toFixed(5)} * topo.g;
  }
`

function heightFromTexel(r: number, g: number) {
  const land = Math.min(1, Math.max(0, (r - 6) / 4))
  const e = Math.min(1, Math.max(0, (r - 8) / 247))
  return land * (TERRAIN.land + TERRAIN.relief * Math.pow(e, 1.6)) - (1 - land) * TERRAIN.ocean * (g / 255)
}

export type TerrainRadius = (lat: number, lon: number) => number

function buildSampler(image: HTMLImageElement): TerrainRadius {
  const { width, height } = image
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0)
  const data = ctx.getImageData(0, 0, width, height).data
  const at = (x: number, y: number) => {
    const i = (((y + height) % height) * width + ((x + width) % width)) * 4
    return heightFromTexel(data[i], data[i + 1])
  }
  // Highest point in the 3x3 neighbourhood, so a marker never sinks into the GPU's filtered terrain.
  return (lat, lon) => {
    const x = Math.floor(((lon + 180) / 360) * width)
    const y = Math.min(height - 1, Math.max(0, Math.floor(((90 - lat) / 180) * height)))
    let h = -Infinity
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) h = Math.max(h, at(x + dx, Math.min(height - 1, Math.max(0, y + dy))))
    return TERRAIN.base + Math.max(h, 0)
  }
}

/** Surface radius at a lat/lon. Suspends until the topo texture (shared with Surface) has loaded. */
export function useTerrain(): TerrainRadius {
  const topo = useLoader(TextureLoader, topoUrl)
  return useMemo(() => buildSampler(topo.image as HTMLImageElement), [topo])
}
