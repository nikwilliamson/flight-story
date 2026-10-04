import { create } from 'zustand'

/** A camera framing in the wireframe's terms: look at the globe centre from (lat, lon), north up (camera-spec.md). */
export interface Shot {
  lon: number
  lat: number
  /** 1 = the globe's radius is 0.42 × the stage's shorter side. */
  zoom: number
  /** Drift east at 4°/s (on screen, at any zoom). */
  spin?: boolean
}

/** The part of the screen the globe is framed in, in CSS px. Cards and panels own the rest. */
export interface Stage {
  x: number
  y: number
  width: number
  height: number
}

interface State {
  shot: Shot
  stage: Stage | null
  /** Leg indices (id - 1) lit in white; everything else dims. Empty = no highlight. */
  highlight: readonly number[]
  setShot: (shot: Shot) => void
  setStage: (stage: Stage | null) => void
  setHighlight: (legs: readonly number[]) => void
}

/** Scroll, tabs and debug write here; the scene reads it, usually straight from its frame loop via getState(). */
export const useStory = create<State>()((set) => ({
  shot: { lon: -40, lat: 28, zoom: 1, spin: true },
  stage: null,
  highlight: [],
  setShot: (shot) => set({ shot }),
  setStage: (stage) => set({ stage }),
  setHighlight: (highlight) => set({ highlight }),
}))
