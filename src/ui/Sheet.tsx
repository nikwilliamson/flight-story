import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { TYPE_NAMES } from '../content/aircraft'
import { airports, legs } from '../data'
import { fmt } from '../data/facts'
import { select } from '../explore/explore'
import { LISTS, ROWS, type ListRow } from '../explore/lists'
import { useStory, type SheetId } from '../state/store'
import { legDate } from '../story/timeline'
import { detailOf } from './interactive'
import { layoutFor, tabBarBottom, useViewport } from './layout'
import { space } from './tokens'

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
    year: l.sort.slice(0, 4),
    date: legDate(l),
    route,
    places: `${city(l.from)} to ${city(l.to)}`,
    airline: l.airlineName ?? '',
    aircraft: [l.aircraft, l.tail].filter(Boolean).join(' · '),
    miles: l.miles ?? 0,
    scope: l.type === 'Helicopter' ? 'heli' : l.intl === null ? '' : l.intl ? 'intl' : 'domestic',
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
  const ready = useStory((s) => s.ready)
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

  if (!sheet || !ready) return null
  const top = tabBarBottom(layout) + space.l
  const style: CSSProperties = layout.phone
    ? { left: space.m, right: space.m, top, bottom: space.m }
    : { left: layout.card.x, width: layout.card.width, top, bottom: space.xl }
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
          <span>{count ? `${fmt(count)} ${count === 1 ? 'match' : 'shown'}` : ''}</span>
          {sheet === 'log' && <button onClick={() => setNewestFirst((v) => !v)}>{newestFirst ? 'Newest first' : 'Oldest first'}</button>}
        </div>
      </header>
      <div className="sheet-body">
        {count === 0 && <p className="sheet-empty">{`Nothing matches “${query.trim()}”. Try a city, an airline or a year.`}</p>}
        {sheet === 'log' ? (
          <ol className="sheet-log">
            {log.map((r, i) => (
              <Fragment key={r.row.id}>
                {/* A year header wherever the year turns, pinned while its legs scroll under it. */}
                {r.year !== log[i - 1]?.year && (
                  <li className="year" aria-hidden>
                    {r.year}
                  </li>
                )}
                <li className={selected === r.row.id ? 'on' : ''} onMouseEnter={() => hover(r.row)} onClick={() => select(r.row)}>
                  <span className="when">{r.date}</span>
                  <span className={`route ${r.scope}`}>{r.route}</span>
                  <span className="miles">{fmt(r.miles)}</span>
                  <span className="places">{r.places}</span>
                  <span className="craft">{[r.airline, r.aircraft].filter(Boolean).join(' · ')}</span>
                </li>
              </Fragment>
            ))}
          </ol>
        ) : (
          <ol className="sheet-list">
            {rows.map((r) => (
              <li key={r.id} className={selected === r.id ? 'on' : ''} onMouseEnter={() => hover(r)} onClick={() => select(r)}>
                <span className="rank">{String(ranks.get(r.id)).padStart(2, '0')}</span>
                <span className="label">
                  {r.label}
                  {detailOf(r) && <small>{detailOf(r)}</small>}
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
