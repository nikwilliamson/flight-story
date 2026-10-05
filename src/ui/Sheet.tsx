import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { TYPE_NAMES } from '../content/aircraft'
import { airports, legs } from '../data'
import { fmt } from '../data/facts'
import { select } from '../explore/explore'
import { CHIPS, detailOf, HOMES, LISTS, ROWS, type ListId, type ListRow } from '../explore/lists'
import { PANELS } from '../explore/panels'
import { useStory } from '../state/store'
import { legDate } from '../story/timeline'
import { layoutFor, tabBarBottom, useViewport } from './layout'
import { space } from './tokens'

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

const hover = (r: ListRow | null) => useStory.getState().setHover(r ? r.legs : null)

/**
 * Every tab, as one panel built on the log (Nik): a near-solid glass panel in the card column (under the globe on
 * phones), a head with the tab's title, search and a meta line, then rows that scroll natively. Hover lights a row's
 * legs on the globe and a click flies there, as everywhere else.
 */
export function Sheet() {
  const tab = useStory((s) => s.tab)
  const ready = useStory((s) => s.ready)
  const selected = useStory((s) => s.selection?.id)
  const [query, setQuery] = useState('')
  const [newestFirst, setNewestFirst] = useState(true)
  const [pick, setPick] = useState(0)
  const size = useViewport()
  useEffect(() => {
    setQuery('')
    setPick(0)
  }, [tab])

  const layout = layoutFor(size.width, size.height)
  const spec = tab && tab !== 'log' ? PANELS[tab] : null
  const list: ListId | null = spec?.lists[Math.min(pick, spec.lists.length - 1)]?.id ?? null
  const q = query.trim().toLowerCase()
  const ranks = useMemo(() => new Map(list ? LISTS[list].rows.map((r, i) => [r.id, i + 1]) : []), [list])
  const rows = useMemo(() => (list ? LISTS[list].rows.filter((r) => !q || matches(hayOf(r), q)) : []), [list, q])
  const log = useMemo(() => {
    if (tab !== 'log') return []
    const found = LOG.filter((r) => !q || matches(r.hay, q))
    return newestFirst ? found.reverse() : found
  }, [tab, q, newestFirst])

  if (!tab || !ready) return null
  const top = tabBarBottom(layout) + space.l
  const style: CSSProperties = layout.phone
    ? { left: space.m, right: space.m, top, maxHeight: size.height - top - space.m }
    : { left: layout.card.x, width: layout.card.width, top, maxHeight: size.height - top - space.xl }
  const searchable = tab === 'log' || !!list
  const count = tab === 'log' ? log.length : rows.length
  const title = tab === 'log' ? 'The log' : spec!.title

  return (
    <section className="sheet" style={style} onMouseLeave={() => hover(null)} aria-label={title}>
      <header className="sheet-head">
        <span className="sheet-eyebrow">{tab === 'log' ? 'Log' : spec!.eyebrow}</span>
        <h2>{title}</h2>
        {spec && <p className="sheet-intro">{spec.intro}</p>}
        {searchable && (
          <input
            className="sheet-search"
            type="search"
            value={query}
            placeholder={tab === 'log' ? 'Search airports, airlines, years' : `Search ${spec!.eyebrow.toLowerCase()}`}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        {searchable && (
          <div className="sheet-meta">
            <span>{count ? `${fmt(count)} ${count === 1 ? 'match' : 'shown'}` : ''}</span>
            {tab === 'log' && <button onClick={() => setNewestFirst((v) => !v)}>{newestFirst ? 'Newest first' : 'Oldest first'}</button>}
            {spec && spec.lists.length > 1 && (
              <span className="sheet-switch">
                {spec.lists.map((l, i) => (
                  <button key={l.id} className={i === pick ? 'on' : ''} onClick={() => setPick(i)}>
                    {l.label}
                  </button>
                ))}
              </span>
            )}
          </div>
        )}
      </header>
      <div className="sheet-body">
        {spec?.filters && <Filters selected={selected} />}
        {spec?.homes && !q && <Homes selected={selected} />}
        {searchable && count === 0 && <p className="sheet-empty">{`Nothing matches “${query.trim()}”. Try a city, an airline or a year.`}</p>}
        {tab === 'log' ? (
          <ol className="rows log">
            {log.map((r, i) => (
              <Fragment key={r.row.id}>
                {/* A year header wherever the year turns, pinned while its legs scroll under it. */}
                {r.year !== log[i - 1]?.year && (
                  <li className="year" aria-hidden>
                    {r.year}
                  </li>
                )}
                <li className={selected === r.row.id ? 'on' : ''} onMouseEnter={() => hover(r.row)} onClick={() => select(r.row)}>
                  <span className="meta">{r.date}</span>
                  <span className={`title ${r.scope}`}>{r.route}</span>
                  <span className="count">{`${fmt(r.miles)} mi`}</span>
                  <span className="line">{r.places}</span>
                  <span className="line dim">{[r.airline, r.aircraft].filter(Boolean).join(' · ')}</span>
                </li>
              </Fragment>
            ))}
          </ol>
        ) : (
          list && (
            <>
              {!q && spec!.lists.length === 1 && <h3 className="sheet-section">{spec!.lists[0].label}</h3>}
              <ol className="rows">
                {rows.map((r) => (
                  <li key={r.id} className={[selected === r.id && 'on', r.tag === 'gone' && 'gone'].filter(Boolean).join(' ')} onMouseEnter={() => hover(r)} onClick={() => select(r)}>
                    {detailOf(r) && <span className="meta">{detailOf(r)}</span>}
                    <span className="rank">{String(ranks.get(r.id)).padStart(2, '0')}</span>
                    <span className="title">{r.label}</span>
                    <span className="count">{`${fmt(r.count)} ${r.count === 1 ? 'leg' : 'legs'}`}</span>
                  </li>
                ))}
              </ol>
            </>
          )
        )}
      </div>
    </section>
  )
}

/** Explore: the decades and domestic or international, as pills that light and fly like rows. */
function Filters({ selected }: { selected?: string }) {
  const groups: [string, ListRow[]][] = [
    ['Decades', CHIPS.filter((c) => c.id.startsWith('decade'))],
    ['Domestic and international', CHIPS.filter((c) => c.id.startsWith('scope'))],
  ]
  return (
    <>
      {groups.map(([label, chips]) => (
        <div key={label} className="sheet-group">
          <h3 className="sheet-section">{label}</h3>
          <div className="sheet-pills">
            {chips.map((c) => (
              <button key={c.id} className={selected === c.id ? 'pill on' : 'pill'} onMouseEnter={() => hover(c)} onMouseLeave={() => hover(null)} onClick={() => select(c)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

/**
 * Where he lived, on a line from 1965 to now: each home a stretch of the bar, tagged above, lighting the legs flown
 * from it. The current home is in the accent, as its ring on the globe.
 */
function Homes({ selected }: { selected?: string }) {
  const start = HOMES[0].from
  return (
    <div className="sheet-group">
      <h3 className="sheet-section">Homes</h3>
      <div className="homes">
        {HOMES.map((h, k) => (
          <button
            key={h.id}
            className={['home', k === HOMES.length - 1 && 'now', selected === h.id && 'on'].filter(Boolean).join(' ')}
            style={{ flexGrow: h.to - h.from }}
            title={`${h.label} · ${h.detail}`}
            onMouseEnter={() => hover(h)}
            onMouseLeave={() => hover(null)}
            onClick={() => select(h)}
          >
            <span className="tag">{h.short}</span>
          </button>
        ))}
      </div>
      <div className="homes-axis">
        <span>{String(Math.floor(start))}</span>
        <span>Now</span>
      </div>
    </div>
  )
}
