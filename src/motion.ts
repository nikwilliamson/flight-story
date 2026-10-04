/** Whether the reader asked for less motion (OS setting). Read live, so flipping it applies without a reload. */
const query = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null

export const reducedMotion = () => !!query?.matches

/** Per-frame easing factor toward a target at `rate` per second, or 1 (a cut) under reduced motion. */
export const ease = (dt: number, rate: number) => (reducedMotion() ? 1 : 1 - Math.exp(-dt * rate))
