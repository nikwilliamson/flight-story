import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { TYPE_NAMES } from '../content/aircraft'
import { airports, legs } from '../data'
import { fmt } from '../data/facts'
import { select } from '../explore/explore'
import { LISTS, ROWS, type ListRow } from '../explore/lists'
import { useStory, type SheetId } from '../state/store'
import { legDate } from '../story/timeline'
import { fonts } from './fonts'
import { layoutFor, tabBarBottom, useViewport } from './layout'

// The HTML panels use the scene's own type: register the same files with the browser.
const faces: [string, string][] = [
  ['Story Display', fonts.display],
  ['Story Body', fonts.body],
  ['Story Mono', fonts.mono],
]
for (const [family, url] of faces) new FontFace(family, `url(${url})`).load().then((f) => document.fonts.add(f), () => {})

const TITLES: Record<SheetId, string> = {
  trips: 'Every trip',
  airports: 'Every airport',
  families: 'Every type',
  planes: 'Every aircraft',
  airlines: 'Every airline',
  log: 'The log',
}

const code = (i: number) => (i >= 0 ? airports[i].code : '?')
const city = (i: number) => (i >= 0 ? airports[i].city : '')

/**
 * The log as rows, with what search looks through. Fare, hotel and Steve's notes never leave the build or show; his
 * trip purposes are matched only through the trip's shown name.
 */
const LOG = legs.map((l, i) => {
  const route = `${code(l.from)}–${code(l.to)}`
  const row: ListRow = { id: `leg-${l.id}`, label: route, count: 1, legs: [i] }
  return {
    row,
    date: legDate(l),
    route,
    places: `${city(l.from)} to ${city(l.to)}`,
    airline: l.airlineName ?? '',
    aircraft: [l.aircraft, l.tail].filter(Boolean).join(' · '),
    miles: l.miles ?? 0,
    hay: [l.sort.slice(0, 4), legDate(l), route, city(l.from), city(l.to), l.airlineName, l.airline, l.aircraft, l.family, l.family && TYPE_NAMES[l.family], l.tail, ROWS.get(`trip-${l.trip}`)?.label, `leg ${l.id}`].filter(Boolean).join(' ').toLowerCase(),
  }
})

const hayOf = (r: ListRow) => [r.label, r.detail, r.tag].filter(Boolean).join(' ').toLowerCase()

/** Matches every word of the query, in any order. Filters, never re-sorts (wireframe). */
const matches = (hay: string, query: string) => query.split(/\s+/).every((w) => hay.includes(w))

/**
 * "Show all" and the log: a scrolling glass panel in the card column (under the globe on phones) with a search that
 * sticks to its top. HTML, not the scene, because long lists and text input are what HTML is good at; hover and
 * click drive the globe exactly as the in-scene rows do.
 */
export function Sheet() {
  const sheet = useStory((s) => s.sheet)
  const selected = useStory((s) => s.selection?.id)
  const [query, setQuery] = useState('')
  const [newestFirst, setNewestFirst] = useState(true)
  const size = useViewport()
  useEffect(() => setQuery(''), [sheet])

  const layout = layoutFor(size.width, size.height)
  const q = query.trim().toLowerCase()
  const ranks = useMemo(() => new Map(sheet && sheet !== 'log' ? LISTS[sheet].rows.map((r, i) => [r.id, i + 1]) : []), [sheet])
  const rows = useMemo(() => (sheet && sheet !== 'log' ? LISTS[sheet].rows.filter((r) => !q || matches(hayOf(r), q)) : []), [sheet, q])
  const log = useMemo(() => {
    if (sheet !== 'log') return []
    const found = LOG.filter((r) => !q || matches(r.hay, q))
    return newestFirst ? found.reverse() : found
  }, [sheet, q, newestFirst])

  if (!sheet) return null
  const top = layout.phone ? layout.stage.height + 8 : tabBarBottom(layout) + 16
  const style: CSSProperties = layout.phone
    ? { left: 12, right: 12, top, bottom: 12 }
    : { left: layout.card.x, width: layout.card.width, top, bottom: 24 }
  const hover = (r: ListRow | null) => useStory.getState().setHover(r ? r.legs : null)
  const count = sheet === 'log' ? log.length : rows.length

  return (
    <section className="sheet" style={style} onMouseLeave={() => hover(null)} aria-label={TITLES[sheet]}>
      <header className="sheet-head">
        <h2>{TITLES[sheet]}</h2>
        <button className="sheet-close" onClick={() => useStory.getState().setSheet(null)} aria-label="Close">
          ×
        </button>
        <input
          className="sheet-search"
          type="search"
          value={query}
          placeholder={sheet === 'log' ? 'Airport, city, airline, aircraft, year or trip' : 'Search'}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={!layout.phone}
        />
        <div className="sheet-meta">
          <span>{`${fmt(count)} ${count === 1 ? 'match' : 'shown'}`}</span>
          {sheet === 'log' && <button onClick={() => setNewestFirst((v) => !v)}>{newestFirst ? 'Newest first' : 'Oldest first'}</button>}
        </div>
      </header>
      <div className="sheet-body">
        {sheet === 'log' ? (
          <ol className="sheet-log">
            {log.map((r) => (
              <li key={r.row.id} className={selected === r.row.id ? 'on' : ''} onMouseEnter={() => hover(r.row)} onClick={() => select(r.row)}>
                <span className="when">{r.date}</span>
                <span className="route">{r.route}</span>
                <span className="miles">{fmt(r.miles)}</span>
                <span className="places">{r.places}</span>
                <span className="craft">{[r.airline, r.aircraft].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ol>
        ) : (
          <ol className="sheet-list">
            {rows.map((r) => (
              <li key={r.id} className={selected === r.id ? 'on' : ''} onMouseEnter={() => hover(r)} onClick={() => select(r)}>
                <span className="rank">{String(ranks.get(r.id)).padStart(2, '0')}</span>
                <span className="label">
                  {r.label}
                  {r.tag && <em>{r.tag}</em>}
                  {r.detail && <small>{r.detail}</small>}
                </span>
                <span className="count">{fmt(r.count)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
