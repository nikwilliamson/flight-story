import { create } from 'zustand'

/** A camera framing in the wireframe's terms: look at the globe centre from (lat, lon), north up (camera-spec.md). */
export interface Shot {
  lon: number
  lat: number
  /** 1 = the globe's radius is 0.42 × the stage's shorter side. */
  zoom: number
  /** Drift east at 4°/s (on screen, at any zoom). */
  spin?: boolean
  /**
   * Leg indices (id - 1) to keep in frame: the camera zooms out as far as it must for both ends of each to show once
   * it is tilted and turned, and turns into the longest one's direction of travel.
   */
  fit?: readonly number[]
}

/** The part of the screen the globe is framed in, in CSS px. Cards and panels own the rest. */
export interface Stage {
  x: number
  y: number
  width: number
  height: number
}

export type TabId = 'explore' | 'trips' | 'airports' | 'planes' | 'airlines' | 'log'
/** A full list or the log, in an HTML panel ("Show all"). */
export type SheetId = 'trips' | 'airports' | 'families' | 'planes' | 'airlines' | 'log'

interface State {
  /** The loader has started to lift: the HTML chrome (tabs, sheet) waits for it so it never sits on the cover. */
  ready: boolean
  /** The scene can't draw: it threw, or the browser took the WebGL context away. */
  failed: 'error' | 'lost' | null
  setReady: () => void
  setFailed: (failed: 'error' | 'lost') => void
  shot: Shot
  stage: Stage | null
  /** Leg indices (id - 1) lit in white; everything else dims. Empty = no highlight. */
  highlight: readonly number[]
  /** The reader can drag the globe (the end of the story, and the tabs). */
  interactive: boolean
  setShot: (shot: Shot) => void
  setStage: (stage: Stage | null) => void
  setHighlight: (legs: readonly number[]) => void
  setInteractive: (interactive: boolean) => void
  /** After the story: which tab is open (null = the closing card). */
  tab: TabId | null
  sheet: SheetId | null
  /** Leg indices under the pointer in a tab, and the clicked selection, which stays lit (wireframe). */
  hover: readonly number[] | null
  selection: { id: string; legs: readonly number[] } | null
  setTab: (tab: TabId | null) => void
  setSheet: (sheet: SheetId | null) => void
  setHover: (legs: readonly number[] | null) => void
  setSelection: (selection: { id: string; legs: readonly number[] } | null) => void
}

/** Scroll, tabs and debug write here; the scene reads it, usually straight from its frame loop via getState(). */
export const useStory = create<State>()((set) => ({
  ready: false,
  failed: null,
  setReady: () => set({ ready: true }),
  setFailed: (failed) => set({ failed }),
  shot: { lon: -40, lat: 28, zoom: 1, spin: true },
  stage: null,
  highlight: [],
  interactive: false,
  setShot: (shot) => set({ shot }),
  setStage: (stage) => set({ stage }),
  setHighlight: (highlight) => set({ highlight }),
  setInteractive: (interactive) => set({ interactive }),
  tab: null,
  sheet: null,
  hover: null,
  selection: null,
  // Changing tabs drops whatever was lit (Nik).
  setTab: (tab) => set({ tab, sheet: tab === 'log' ? 'log' : null, hover: null, selection: null }),
  setSheet: (sheet) => set({ sheet, hover: null }),
  setHover: (hover) => set({ hover }),
  setSelection: (selection) => set({ selection }),
}))
