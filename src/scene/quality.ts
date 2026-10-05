/** Touch-first devices (phones, tablets): the GPU is weaker and the fill rate per CSS pixel higher, so they get a lighter tier. */
export const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

/** Phones also load the 2048 lights map instead of the 4096 one (Surface). */
const TIERS = {
  fine: {
    /** Scattering: view-ray samples per side of the densest point, and samples toward the sun from each. */
    scatterSteps: 14,
    scatterLightSteps: 6,
    /** The stylized (classic) glow: samples per side. */
    glowSteps: 28,
    /** Surface: fbm octaves in each of the three inner-fog layers. */
    fogOctaves: 3,
    /** Surface sphere segments (width, height); ~0.5 deg per quad resolves mountain ranges. */
    sphere: [720, 360] as const,
  },
  coarse: {
    scatterSteps: 8,
    scatterLightSteps: 4,
    glowSteps: 14,
    fogOctaves: 2,
    sphere: [360, 180] as const,
  },
}

export const QUALITY = coarse ? TIERS.coarse : TIERS.fine
