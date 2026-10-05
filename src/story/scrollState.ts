import type { Plan } from './scrollPlan'

/** Shared between the cards (which lay out the plan) and the driver (which runs the chapters off it). */
let resolvePlan: (plan: Plan) => void = () => {}
/** Resolves once the cards are measured and the story laid out, for anything that must wait for the scroll positions. */
export const planReady = new Promise<Plan>((resolve) => (resolvePlan = resolve))
export const setPlan = (plan: Plan | null) => {
  scroll.plan = plan
  if (plan) resolvePlan(plan)
}

export const scroll = {
  plan: null as Plan | null,
  /** Chapter whose card last crossed the reading line, and how far its playback has run, 0–1. */
  active: 0,
  progress: 0,
}
