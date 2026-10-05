import { fmt } from '../data/facts'
import type { TabId } from '../state/store'
import type { CardContent } from '../story/chapters'
import { coarse } from '../scene/quality'
import { CHIPS, LISTS } from './lists'

/** Touch has no hover: a tap lights and flies at once. */
const LIGHT = coarse ? 'Tap one to light it and fly there.' : 'Hover one to light it; click to fly the globe to it.'

/** Each tab's card after the story. Phones get fewer rows, so a panel fits under the pinned globe. */
export function panelFor(tab: Exclude<TabId, 'log'>, phone: boolean): CardContent {
  const top = phone ? 5 : 10
  switch (tab) {
    case 'explore':
      return {
        eyebrow: 'Explore',
        title: 'Over to you',
        body: coarse
          ? 'Drag to spin it, pinch to zoom. Tap anything in these tabs to light its flights and fly there.'
          : 'Drag to spin it, pinch or ctrl-scroll to zoom. Hover anything in these tabs to light its flights, click to fly there, and press Esc to clear.',
        modules: [
          { kind: 'filters', label: 'Decades', chips: CHIPS.filter((c) => c.id.startsWith('decade')) },
          { kind: 'filters', label: 'Domestic and international', chips: CHIPS.filter((c) => c.id.startsWith('scope')) },
        ],
      }
    case 'trips':
      return {
        eyebrow: 'Trips',
        title: `${fmt(LISTS.trips.rows.length)} trips`,
        body: `Using Steve's own trip markers, biggest first. ${LIGHT}`,
        modules: [{ kind: 'list', label: 'Most legs', list: 'trips', top }],
      }
    case 'airports':
      return {
        eyebrow: 'Airports',
        title: `${fmt(LISTS.airports.rows.length)} airports`,
        body: `Every field he flew in or out of, by legs. ${LIGHT}`,
        modules: [{ kind: 'list', label: 'Most visited', list: 'airports', top }],
      }
    case 'planes':
      return {
        eyebrow: 'Aircraft',
        title: `${fmt(LISTS.planes.rows.length)} aircraft`,
        body: `Across ${fmt(LISTS.families.rows.length)} types. ${LIGHT}`,
        modules: [
          { kind: 'list', label: 'Types', list: 'families', top: phone ? 3 : 5 },
          { kind: 'list', label: 'Most flown aircraft', list: 'planes', top: phone ? 3 : 5 },
        ],
      }
    case 'airlines':
      return {
        eyebrow: 'Airlines',
        title: `${fmt(LISTS.airlines.rows.length)} airlines`,
        body: 'Including the ones that no longer exist.',
        modules: [{ kind: 'list', label: 'Most flown', list: 'airlines', top }],
      }
  }
}
