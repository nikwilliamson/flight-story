import { airports, legs } from '../data'
import { facts, fmt, span } from '../data/facts'
import { airlineGroups, groups, planeGroups } from '../data/indexes'
import { SAFETY_NETWORK_FACT, STORIES } from '../content/stories'
import type { ListId, ListRow } from '../explore/lists'
import type { Leg } from '../data/types'
import { legDate } from './timeline'
import { SHOTS } from './shots'
import type { Shot } from '../state/store'

/** What a card can hold under its paragraph. Every number comes from the data. */
export type Module =
  | { kind: 'stats'; label: string; items: [string, string][] }
  | { kind: 'rank'; label: string; items: [string, string][] }
  | { kind: 'chips'; label: string; items: string[] }
  | { kind: 'fact'; text: string }
  | { kind: 'pass'; label: string; from: [string, string]; to: [string, string]; intl: boolean; rows: [string, string][] }
  | { kind: 'table'; label: string; rows: string[][] }
  | { kind: 'nights'; label: string; nights: (string | null)[] }
  | { kind: 'planes'; label: string; planes: Plane[] }
  /** After the story: a ranked list's top rows, each lighting its legs on hover and flying there on click. */
  | { kind: 'list'; label: string; list: ListId; top: number }
  /** After the story: filter chips that light and fly like list rows. */
  | { kind: 'filters'; label: string; chips: ListRow[] }
  /** After the story: where he flew from, as a timeline whose stretches light like list rows. */
  | { kind: 'homes'; label: string }

/** An airframe card: what it was, how old, where he flew it, and its story if it has one. */
export interface Plane {
  /** Leg id. */
  leg: number
  /** As logged, for its photo. */
  tail: string | null
  title: string
  meta: string
  story?: string
}

/** What a card shows: story chapters and the tab panels after the story share the card. */
export interface CardContent {
  eyebrow: string
  title: string
  body: string
  modules: Module[]
}

export interface Chapter extends CardContent {
  id: string
  /** Shown in the rail. */
  label: string
  shot: Shot
  /** Leg ids (1-based, inclusive) that draw as the reader scrolls; omitted = the whole log, already drawn. */
  range?: [number, number]
  /** Keep the legs drawn so far instead of drawing the range (asides that break chronology). */
  hold?: boolean
  /** Leg ids lit in white while the chapter is on. */
  highlight?: number[]
  /** The skydive: the onboard footage plays behind the globe, scrubbed by the scroll. */
  jump?: boolean
  /** The distance section: one line laps the Earth, then unspools to the Moon and back, scrubbed by the scroll. */
  scene?: 'laps' | 'moon'
}

const legsOf = ([a, b]: [number, number]) => legs.slice(a - 1, b)
const code = (i: number) => (i >= 0 ? airports[i].code : '?')
const mi = (n: number) => `${fmt(n)} mi`

function chapterStats([a, b]: [number, number], label = 'Chapter stats'): Module {
  const s = span(legsOf([a, b]))
  return { kind: 'stats', label, items: [['Legs', fmt(s.legs)], ['Miles', fmt(s.miles)], ['Airports', fmt(s.airports)], ['Countries', fmt(s.countries)]] }
}

function topAirports(range: [number, number], n: number, label: string): Module {
  const counts = new Map<number, number>()
  for (const leg of legsOf(range)) for (const i of new Set([leg.from, leg.to])) if (i >= 0) counts.set(i, (counts.get(i) ?? 0) + 1)
  const items = [...counts].sort((x, y) => y[1] - x[1]).slice(0, n)
  return { kind: 'rank', label, items: items.map(([i, c]) => [`${airports[i].code} · ${airports[i].city}`, fmt(c)]) }
}

function topAirlines(range: [number, number], n: number, label: string): Module {
  const counts = new Map<string, number>()
  for (const leg of legsOf(range)) if (leg.airlineName) counts.set(leg.airlineName, (counts.get(leg.airlineName) ?? 0) + 1)
  return { kind: 'rank', label, items: [...counts].sort((x, y) => y[1] - x[1]).slice(0, n).map(([name, c]) => [name, fmt(c)]) }
}

/** Airport codes along a run of legs, a stop that starts where the last leg ended counted once. */
function route(range: [number, number]): string[] {
  const out: string[] = []
  for (const leg of legsOf(range)) {
    if (out.at(-1) !== code(leg.from)) out.push(code(leg.from))
    out.push(code(leg.to))
  }
  return out
}

/** Homes in order across a range of legs. */
function homes(range: [number, number]): string[] {
  const out: string[] = []
  for (const leg of legsOf(range)) {
    const c = `${airports[leg.home].city}`
    if (out.at(-1) !== c) out.push(c)
  }
  return out
}

/** Airport code where each night of a trip ended, null where nothing flew that day. */
function nights(range: [number, number], from: string, to: string): (string | null)[] {
  const byDate = new Map<string, Leg>()
  for (const leg of legsOf(range)) if (leg.date) byDate.set(leg.date, leg)
  const out: (string | null)[] = []
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const leg = byDate.get(d.toISOString().slice(0, 10))
    out.push(leg ? code(leg.to) : null)
  }
  return out
}

/** How exactly a run of legs is dated: Steve's notes are never shown (Nik), but how sure he was is. */
function precision(range: [number, number]): Module {
  const list = legsOf(range)
  const share = (p: Leg['precision'][]) => `${Math.round((100 * list.filter((l) => p.includes(l.precision)).length) / list.length)}%`
  return { kind: 'stats', label: 'How exact the dates are', items: [['Legs', fmt(list.length)], ['Exact day', share(['Exact'])], ['Month', share(['Month', 'Range'])], ['Year only', share(['Year', 'Unknown'])]] }
}

function planes(label: string, ids: number[]): Module {
  return {
    kind: 'planes',
    label,
    planes: ids.map((id) => {
      const l = legs[id - 1]
      const flown = Number(l.sort.slice(0, 4))
      const age = !l.built ? `Flown ${flown}` : flown - l.built < 1 ? `Built ${l.built} · brand new when he flew it` : `Built ${l.built} · ${flown - l.built} year${flown - l.built === 1 ? '' : 's'} old when he flew it`
      const where = l.from === l.to ? `${airports[l.from].city} joyride` : `${airports[l.from].city} to ${airports[l.to].city}`
      return { leg: id, tail: l.tail, title: [l.aircraft, l.tail].filter(Boolean).join(' · '), meta: `${age}\n${where}, ${flown}`, story: STORIES[id] }
    }),
  }
}

const first = legs[0]
const longestLeg = legs[facts.longest[0].id - 1]
const hopper = facts.busiestDay.legs
const hopperTails = new Map<string, number>()
for (const id of hopper) if (legs[id - 1].tail) hopperTails.set(legs[id - 1].tail!, (hopperTails.get(legs[id - 1].tail!) ?? 0) + 1)
const [hopperTail, hopperLandings] = [...hopperTails].sort((a, b) => b[1] - a[1])[0]
const hopperPlane = groups.plane.get(hopperTail)!
const mostFlown = planeGroups[0].key === hopperTail && planeGroups[1].count < hopperPlane.count
const hopperFact = `${hopperLandings === 6 ? 'Six' : fmt(hopperLandings)} of those landings were the same aircraft, ${hopperTail}. ${mostFlown ? `He flew on it ${hopperPlane.count} times, more than any other aircraft he ever boarded.` : `He flew on it ${hopperPlane.count} times in all.`}`
const hndItm = facts.topRoutes.find((r) => r.route === 'HND–ITM')?.legs ?? 0
const last = legs[legs.length - 1]
const JOYRIDES = [75, 836, 1003, 723, 990, 1385]
const AIRFRAMES = [98, 990, 1520, 1452]
const LATER_LIVES = [1093, 989, 1139, 1494]
const defunct = airlineGroups.filter((g) => g.defunct)
const defunctIds = defunct.flatMap((g) => [...g.legs].map((i) => i + 1)).sort((a, b) => a - b)
const RANGES = {
  first: [1, 4],
  summers: [5, 20],
  atlantic: [21, 48],
  florida: [49, 151],
  tour: [152, 392],
  osaka: [393, 602],
  hockey: [748, 782],
  longOnes: [783, 974],
  hopper: [hopper[0], hopper.at(-1)!],
  peak: [983, 1316],
  jump: [1385, 1385],
  stillGoing: [1317, legs.length],
} satisfies Record<string, [number, number]>

export const CHAPTERS: Chapter[] = [
  {
    id: 'opening',
    label: '1965–2025',
    eyebrow: '1965–2025',
    title: "Steve's journey to 1,000,000 and more",
    body: `Sixty years of flying, logged by hand, one row per leg. Steve has gone around the Earth ${fmt(facts.laps)} times, or to the Moon and back ${fmt(facts.moonTrips, 1)} times. Scroll to fly them in order.`,
    modules: [{ kind: 'stats', label: 'Totals', items: [['Legs', fmt(facts.legs)], ['Miles', fmt(facts.miles)], ['Airports', fmt(facts.airports)], ['Countries', fmt(facts.countries)]] }],
    shot: SHOTS.opening,
  },
  {
    id: 'first',
    label: '1965',
    eyebrow: '1965',
    title: 'The first one',
    body: `${legDate(first)}. London Gatwick to Barcelona on a ${first.airlineName} BAC One-Eleven, then on to Ibiza. ${mi(first.miles ?? 0)}, the first of more than ${fmt(Math.floor(facts.miles / 1e5) / 10, 1)} million.`,
    modules: [
      {
        kind: 'pass',
        label: 'Route card · leg 1',
        from: [code(first.from), airports[first.from].city],
        to: [code(first.to), airports[first.to].city],
        intl: !!first.intl,
        rows: [['Date', legDate(first)], ['Airline', first.airlineName ?? ''], ['Aircraft', first.aircraft ?? ''], ['Distance', mi(first.miles ?? 0)]],
      },
    ],
    shot: SHOTS.first,
    range: RANGES.first,
  },
  {
    id: 'summers',
    label: '1968',
    eyebrow: '1968–1972',
    title: 'Summers from London',
    body: 'Holidays out of Heathrow and Luton: Ibiza again, then Naples, Malta, Lisbon, Faro, Munich, Palma and Milan. Two to four legs a year.',
    modules: [chapterStats(RANGES.summers), topAirports(RANGES.summers, 4, 'Most visited this chapter')],
    shot: SHOTS.summers,
    range: RANGES.summers,
  },
  {
    id: 'atlantic',
    label: '1973',
    eyebrow: '1973–1981',
    title: 'Across the Atlantic',
    body: 'March 1973: Heathrow to New York JFK for the first time. Over the next nine years home moved between London, New York and Boston, and the Atlantic turned into a commute.',
    modules: [{ kind: 'chips', label: 'Home base', items: homes(RANGES.atlantic) }],
    shot: SHOTS.atlantic,
    range: RANGES.atlantic,
  },
  {
    id: 'florida',
    label: '1982',
    eyebrow: '1982–1989',
    title: 'Florida',
    body: 'Home became Fort Lauderdale in 1982 and Orlando in 1988, where it has stayed. Many 1980s dates are approximate, so Steve went back to old airline timetables and wrote down his reasoning.',
    modules: [precision(RANGES.florida)],
    shot: SHOTS.florida,
    range: RANGES.florida,
  },
  {
    id: 'tour',
    label: '1990',
    eyebrow: '1990–1999',
    title: 'On tour',
    body: 'Work took over. In June 1990 the Nick Express tour crossed six cities in two days by Bell 206 helicopter. The Lev Tour ran from 1992 to 1999, and Promax conventions came round most years.',
    modules: [
      { kind: 'chips', label: 'Nick Express · 5–6 June 1990', items: route([160, 164]) },
      { kind: 'fact', text: 'The helicopter landed in Orlando the day before Nickelodeon Studios opened at Universal Studios Florida, on 7 June 1990.' },
      chapterStats(RANGES.tour),
    ],
    shot: SHOTS.tour,
    range: RANGES.tour,
    highlight: [160, 161, 162, 163, 164],
  },
  {
    id: 'osaka',
    label: '2000',
    eyebrow: '2000–2002',
    title: 'The Osaka years',
    body: 'In April 2000 Steve moved to Japan to work at Universal Studios Japan, and for two years home was Osaka. San Francisco was the way back to Orlando, and Itami to Haneda turns up most months. He came home in July 2002.',
    modules: [
      chapterStats(RANGES.osaka),
      { kind: 'fact', text: `${fmt(facts.osaka.laps)} times around the Earth in just over two years. ${facts.bestYear.year} was his biggest year: ${fmt(facts.bestYear.miles)} miles on ${facts.bestYear.legs} legs.` },
      { kind: 'fact', text: `Tokyo Haneda to Osaka Itami, one of the world's busiest air corridors, ${hndItm} times.` },
      topAirlines(RANGES.osaka, 4, 'Top airlines this chapter'),
    ],
    shot: SHOTS.osaka,
    range: RANGES.osaka,
  },
  {
    id: 'hockey',
    label: 'Hockey',
    eyebrow: '26 Oct – 24 Nov 2007',
    title: '30 games in 30 nights',
    body: 'Thirty nights, thirty NHL games. Steve left Orlando for Detroit on 26 October and came home from Raleigh on 24 November, with Ottawa, Calgary, Vancouver, Edmonton and Toronto along the way.',
    modules: [
      { kind: 'stats', label: 'Trip stats', items: [['Legs', fmt(facts.hockey.legs)], ['Miles', fmt(facts.hockey.miles)], ['Airports', fmt(facts.hockey.airports)], ['Airlines', fmt(facts.hockey.airlines)]] },
      { kind: 'fact', text: `${fmt(facts.hockey.laps, 1)} times around the planet in 30 days, for hockey. The New York Times wrote it up on 5 November 2007.` },
      { kind: 'nights', label: 'Where each night ended', nights: nights(RANGES.hockey, '2007-10-26', '2007-11-24') },
    ],
    shot: SHOTS.hockey,
    range: RANGES.hockey,
  },
  {
    id: 'longOnes',
    label: '2008',
    eyebrow: '2008–2011',
    title: 'The long ones',
    body: `The longest flight in the log is San Francisco to Sydney in May 2009: ${mi(longestLeg.miles ?? 0)} on a United 747-400, and back three days later. He crossed the equator ${facts.equatorCrossings} times and the date line about ${facts.dateLineCrossings} times.`,
    modules: [
      {
        kind: 'table',
        label: 'Longest legs',
        rows: facts.longest.slice(0, 5).map(({ id, miles }) => {
          const l = legs[id - 1]
          return [`${code(l.from)}–${code(l.to)}`, l.sort.slice(0, 4), fmt(miles)]
        }),
      },
      { kind: 'fact', text: `${facts.jumbo.legs} legs on 747s, ${fmt(facts.jumbo.miles)} miles: ${fmt(facts.jumbo.laps)} times around the Earth on jumbo jets alone.` },
    ],
    shot: SHOTS.longOnes,
    range: RANGES.longOnes,
    highlight: facts.longest.slice(0, 5).map((l) => l.id),
  },
  {
    id: 'hopper',
    label: 'Hopper',
    eyebrow: '14 March 2011',
    title: 'The Island Hopper',
    body: `His busiest day ever: ${hopper.length} flights. The Island Hopper runs from Guam through Chuuk, Pohnpei, Kosrae, Kwajalein and Majuro to Honolulu, about 16 hours with the ground stops. Then on to Los Angeles and home to Orlando. It crosses the date line, so 14 March was a very long day.`,
    modules: [
      { kind: 'chips', label: 'Route', items: route(RANGES.hopper) },
      { kind: 'fact', text: hopperFact },
    ],
    shot: SHOTS.hopper,
    range: RANGES.hopper,
    highlight: hopper.slice(0, 6),
  },
  {
    id: 'peak',
    label: '2011',
    eyebrow: '2011–2014',
    title: 'The peak',
    body: `${facts.busiestYear.year} is the busiest year in the log: ${facts.busiestYear.legs} legs. Along the way: an Air France A380 from Johannesburg to Paris in 2012, Kuwait and back in a week, and Shanghai to Chicago in 2014.`,
    modules: [chapterStats(RANGES.peak)],
    shot: SHOTS.peak,
    range: RANGES.peak,
  },
  {
    id: 'joyrides',
    label: 'Joyrides',
    eyebrow: 'Aside',
    title: 'Not just airliners',
    body: "An aerobatic ride in a Ray-Ban team Pitts. A 1929 Ford Trimotor, a 1931 barnstormer and a 1942 Stearman from a grass field in Polk City. A DC-3 that flew on D-Day. And in 2018, a flight he didn't land with: he jumped out.",
    modules: [planes('Joyrides, warbirds and one skydive', JOYRIDES)],
    shot: SHOTS.joyrides,
    // Asides break chronology on purpose: the lines and the year hold where the peak left them.
    range: RANGES.peak,
    hold: true,
    highlight: [75, 723, 836, 1003, 1385],
  },
  {
    id: 'jump',
    label: 'Jump',
    eyebrow: '18 August 2018 · Titusville, Florida',
    title: 'The jump',
    body: `Leg ${fmt(RANGES.jump[0])} starts and ends at the same airport, and Steve wasn't on board for the landing. He rode a Beech King Air up from the Skydive Space Center drop zone with a cabin full of jumpers, then went out the door.\n\nNik was on the plane with a camera.`,
    modules: [planes('The ride up', [RANGES.jump[0]])],
    shot: SHOTS.jump,
    range: RANGES.peak,
    hold: true,
    highlight: [RANGES.jump[0]],
    jump: true,
  },
  {
    id: 'airframes',
    label: 'Airframes',
    eyebrow: 'Aside',
    title: 'Aircraft with a past',
    body: `He flew on at least ${fmt(facts.planes)} different aircraft. A few of them have stories of their own.`,
    modules: [
      planes('Notable airframes', AIRFRAMES),
      { kind: 'fact', text: `The average aircraft he flew on was ${fmt(facts.averagePlaneAge, 1)} years old. ${facts.newPlaneLegs} of his flights were on aircraft in their first year.` },
    ],
    shot: SHOTS.airframes,
    range: RANGES.peak,
    hold: true,
    highlight: AIRFRAMES,
  },
  {
    id: 'later',
    label: 'Later',
    eyebrow: 'Aside',
    title: 'Later lives',
    body: 'Planes keep flying after you get off. Two of Steve\'s were later written off, and no one died in either. Others had close calls years after he flew them.',
    modules: [planes('What happened next', LATER_LIVES), { kind: 'fact', text: SAFETY_NETWORK_FACT }],
    shot: SHOTS.later,
    range: RANGES.peak,
    hold: true,
    highlight: LATER_LIVES,
  },
  {
    id: 'stillGoing',
    label: '2015',
    eyebrow: '2015–2025',
    title: 'Still going',
    body: `The pace eased after 2015 but never stopped. The last logged flight is ${airports[last.from].city} to ${airports[last.to].city} in ${legDate(last).replace(/^\d+ /, '')}.`,
    modules: [chapterStats([1317, legs.length])],
    shot: SHOTS.stillGoing,
    range: RANGES.stillGoing,
  },
  {
    id: 'gone',
    label: 'Gone',
    eyebrow: '1965–2025',
    title: 'Gone now',
    body: `${fmt(defunctIds.length)} legs were on airlines that no longer exist: Eastern, Pan Am, TWA, Braniff, Northwest, Continental, US Airways, AirTran and more. Some airports went too.`,
    modules: [
      { kind: 'rank', label: 'Airlines that are gone', items: defunct.slice(0, 6).map((g) => [g.label, fmt(g.count)]) },
      { kind: 'rank', label: 'Airports he used that have since closed', items: facts.closedAirports.map(({ airport, legs }) => [`${airport.code} · ${airport.name}, closed ${airport.closed!.slice(0, 4)}`, fmt(legs)]) },
    ],
    shot: SHOTS.gone,
    highlight: defunctIds,
  },
  {
    id: 'laps',
    label: 'Laps',
    eyebrow: 'How far is that',
    title: `${fmt(facts.laps)} times around the Earth`,
    body: `Laid end to end, ${fmt(facts.miles)} miles would wrap the planet ${fmt(facts.laps, 1)} times. Here it is as one line, starting from home in Orlando.`,
    modules: [
      { kind: 'fact', text: `About ${fmt(facts.airTimeDays)} days in the air: roughly ${fmt(facts.airTimeDays / 30.44)} months of his life spent aloft.` },
      { kind: 'fact', text: `Light would cover all of it in about ${fmt(facts.lightSeconds)} seconds.` },
    ],
    shot: SHOTS.laps,
    scene: 'laps',
  },
  {
    id: 'moon',
    label: 'Moon',
    eyebrow: 'How far is that',
    title: `To the Moon and back, almost ${Math.ceil(facts.moonTrips)} times`,
    body: `Now unwind it. Keep the same line, pull back far enough to see the Moon at its real size and distance, and let the line peel off the Earth. Every lap that comes off becomes part of a figure 8 around the Moon, until it reaches the Moon and back ${fmt(facts.moonTrips, 1)} times.`,
    modules: [{ kind: 'fact', text: `That's still only ${fmt(facts.sunShare * 100)}% of the way to the Sun.` }],
    shot: SHOTS.moon,
    scene: 'moon',
  },
  {
    id: 'all',
    label: 'All',
    eyebrow: 'All of it',
    title: `${fmt(facts.legs)} flights`,
    body: `${fmt(facts.miles)} miles to ${fmt(facts.airports)} airports in ${fmt(facts.countries)} countries, on ${fmt(facts.airlines)} airlines and at least ${fmt(facts.planes)} different aircraft.`,
    modules: [topAirports([1, legs.length], 5, 'Most visited airports')],
    shot: SHOTS.all,
  },
]
