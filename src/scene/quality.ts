/** Touch-first devices (phones, tablets): the GPU is weaker and the fill rate per CSS pixel higher, so they get a lighter tier. */
export const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

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
}

/**
 * One tier for every device (Nik: the lighter phone tier made the globe look different and low-res). The frame-budget
 * monitor in Globe.tsx trades resolution for speed instead.
 */
export const QUALITY = TIERS.fine
