import type { Plan } from './scrollPlan'

/** Shared between the cards (which lay out the plan) and the driver (which runs the chapters off it). */
export const scroll = {
  plan: null as Plan | null,
  /** Chapter whose card is locked, and its progress 0–1. */
  active: 0,
  progress: 0,
}
