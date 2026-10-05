import type { Plan } from './scrollPlan'

/** Shared between the cards (which lay out the plan) and the driver (which runs the chapters off it). */
let resolvePlan: (plan: Plan) => void = () => {}
/** Resolves once the cards are measured and the story laid out, for anything that must wait for the scroll positions. */
export const planReady = new Promise<Plan>((resolve) => (resolvePlan = resolve))
const planListeners = new Set<(plan: Plan) => void>()
/** Calls back with every new plan (photos and fonts landing re-lay the story); returns the unsubscribe. */
export const onPlan = (listener: (plan: Plan) => void) => {
  planListeners.add(listener)
  return () => void planListeners.delete(listener)
}
export const setPlan = (plan: Plan | null) => {
  scroll.plan = plan
  if (!plan) return
  resolvePlan(plan)
  planListeners.forEach((l) => l(plan))
}

export const scroll = {
  plan: null as Plan | null,
  /** Chapter whose card last crossed the reading line, and how far its playback has run, 0–1. */
  active: 0,
  progress: 0,
}

/**
 * The story scrolls in its own element (Story.tsx), not the page: the browser moves the cards natively, so they stay
 * under the finger with real momentum, and the phone's toolbar never resizes the view mid-swipe.
 */
export const scroller = { el: null as HTMLElement | null }
export const scrollTop = () => scroller.el?.scrollTop ?? 0
export const scrollToY = (top: number, smooth = false) => scroller.el?.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
