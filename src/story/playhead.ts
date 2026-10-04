import { useSyncExternalStore } from 'react'
import { STORY_END, trips } from './schedule'

export type Speed = 1 | 2 | 4

interface State {
  /** Story time in seconds at 1x. STORY_END = the finished globe. */
  time: number
  playing: boolean
  speed: Speed
}

/**
 * One playhead for the whole page. The scene reads `playhead.state.time` straight from its frame loop; React
 * components subscribe through `usePlayhead`, which re-renders them as it moves.
 */
let state: State = { time: STORY_END, playing: false, speed: 1 }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function set(next: Partial<State>) {
  state = { ...state, ...next }
  emit()
}

export const playhead = {
  get state() {
    return state
  },
  /** Advance by a frame's wall-clock delta while playing; stops at the end. */
  tick(delta: number) {
    if (!state.playing) return
    const time = Math.min(STORY_END, state.time + Math.min(delta, 0.1) * state.speed)
    set({ time, playing: time < STORY_END })
  },
  play() {
    set({ playing: true, time: state.time >= STORY_END - 0.01 ? 0 : state.time })
  },
  pause() {
    set({ playing: false })
  },
  toggle() {
    if (state.playing) playhead.pause()
    else playhead.play()
  },
  seek(time: number) {
    set({ time: Math.min(STORY_END, Math.max(0, time)) })
  },
  seekTrip(index: number) {
    playhead.seek(trips[Math.min(trips.length - 1, Math.max(0, index))].start)
  },
  toEnd() {
    set({ time: STORY_END, playing: false })
  },
  setSpeed(speed: Speed) {
    set({ speed })
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

export const usePlayhead = () => useSyncExternalStore(playhead.subscribe, () => state)

/** Subscribe to one derived value; the component re-renders only when it changes (keep the result primitive). */
export const usePlayheadValue = <T,>(select: (s: State) => T) => useSyncExternalStore(playhead.subscribe, () => select(state))
