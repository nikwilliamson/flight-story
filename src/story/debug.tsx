import { useEffect } from 'react'
import { groups } from '../data/indexes'
import { useStory } from '../state/store'
import { SHOTS, type ShotName } from './shots'

const TOUR_SECONDS = 5

/**
 * Debug hash params for checking the camera and highlight without the story:
 *   #shot=hockey      jump to one chapter's shot
 *   #tour             step through every shot, TOUR_SECONDS each
 *   #hl=trip-266      light a trip (also airport-MCO, airline-UA, family-B747, plane-G-VIRG)
 */
export function DebugHash() {
  useEffect(() => {
    const params = new URLSearchParams(location.hash.slice(1))
    const { setShot, setHighlight } = useStory.getState()
    const name = params.get('shot') as ShotName | null
    if (name && name in SHOTS) setShot(SHOTS[name])
    const hl = params.get('hl')
    if (hl) setHighlight(lookup(hl))
    if (!params.has('tour')) return
    const names = Object.keys(SHOTS) as ShotName[]
    let i = 0
    const id = setInterval(() => setShot(SHOTS[names[i++ % names.length]]), TOUR_SECONDS * 1000)
    return () => clearInterval(id)
  }, [])
  return null
}

function lookup(spec: string): number[] {
  const [kind, ...rest] = spec.split('-')
  const key = rest.join('-')
  if (kind === 'airport') {
    const group = [...groups.airport.values()].find((g) => g.label === key.toUpperCase())
    return group ? [...group.legs] : []
  }
  const table = groups[kind as keyof typeof groups]
  return table?.get(key) ? [...table.get(key)!.legs] : []
}
