import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { creditFor, photoFor, photoUrl, type Photo } from '../data/photos'
import { reducedMotion } from '../motion'
import { useStory } from '../state/store'
import { CHAPTERS, type CardContent, type Module, type Plane } from '../story/chapters'
import { scrollOf } from '../story/pacing'
import { planScroll } from '../story/scrollPlan'
import { scroller, setPlan } from '../story/scrollState'
import { layoutFor, tabBarBottom, useViewport } from './layout'
import { openingTitle, titleParts } from './opening'
import { RAIL_REACH } from './Rail'
import { space } from './tokens'

/** Desktop leaves the rail's strip on the right to the scene, so its keys stay clickable. */
const RAIL_HIT = RAIL_REACH + space.l

/**
 * The story's cards, as HTML in their own scroller over the canvas (the audit: scene-drawn cards trailed the finger on
 * phones). Each card sits in a section laid out from the scroll plan and pins with CSS sticky, so the browser moves it
 * natively, momentum and all, while the scroll position drives the globe exactly as before.
 */
export function Story() {
  const size = useViewport()
  const layout = layoutFor(size.width, size.height)
  const ready = useStory((s) => s.ready)
  const away = useStory((s) => s.tab !== null)
  const released = useStory((s) => s.interactive)
  const el = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLElement | null)[]>([])
  const [heights, setHeights] = useState<(number | undefined)[]>([])
  const viewport = size.height
  const top = tabBarBottom(layout) + space.s

  useLayoutEffect(() => {
    scroller.el = el.current
    return () => void (scroller.el = null)
  }, [])

  // Cards re-measure whenever their text reflows (fonts landing, a resize, a photo arriving).
  useEffect(() => {
    const observer = new ResizeObserver(() => setHeights(cards.current.map((c) => c?.offsetHeight)))
    cards.current.forEach((c) => c && observer.observe(c))
    return () => observer.disconnect()
  }, [])

  const plan = useMemo(() => {
    if (CHAPTERS.some((_, i) => !heights[i])) return null
    const column = { top, bottom: layout.phone ? viewport - space.l : viewport, centre: !layout.phone }
    return planScroll(CHAPTERS.map((ch, i) => ({ height: heights[i]!, scroll: scrollOf(ch) * viewport })), column)
  }, [heights, viewport, top, layout.phone])
  useEffect(() => setPlan(plan), [plan])

  // The loader's title lands where the opening card's title is, for the match cut.
  useEffect(() => {
    const title = cards.current[0]?.querySelector('h1')
    if (!plan || !title) return
    const r = title.getBoundingClientRect()
    Object.assign(openingTitle, { known: true, x: r.left, y: r.top, width: r.width, s: layout.scale })
  }, [plan, layout.scale])

  // Under the tab bar the cards dissolve rather than run behind the pills; phones also fade them in from the globe.
  const fade = `linear-gradient(transparent ${top - space.s}px, #000 ${top + space.l}px, #000 calc(100% - ${space.l}px), transparent)`
  const style: CSSProperties = { right: layout.phone ? 0 : RAIL_HIT, maskImage: fade, WebkitMaskImage: fade }
  const className = ['story', layout.phone && 'phone', ready && 'ready', away && 'away', released && 'released'].filter(Boolean).join(' ')

  return (
    <div ref={el} className={className} style={style}>
      <div className="story-track" style={{ height: plan ? plan.length + viewport : 3 * viewport }}>
        {CHAPTERS.map((chapter, i) => {
          const seg = plan?.segments[i]
          // A section spans the card plus its pin: sticky holds the card at its spot until the section runs out, so the
          // card arrives, holds for its chapter, then leaves, all at the page's own pace.
          const section: CSSProperties = seg
            ? { top: seg.at + seg.pinned, height: seg.height + (seg.until - seg.at - seg.overflow), left: layout.card.x, width: layout.card.width }
            : { top: 0, left: layout.card.x, width: layout.card.width, visibility: 'hidden' }
          return (
            <section key={chapter.id} className="story-chapter" style={section}>
              <article ref={(c) => void (cards.current[i] = c)} className={layout.phone ? 'card bare' : 'card'} style={{ top: seg ? seg.pinned - seg.overflow : 0 }}>
                <Card content={chapter} opening={i === 0} />
              </article>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Card({ content, opening }: { content: CardContent; opening: boolean }) {
  const [before, million, after] = titleParts(content.title)
  const Title = opening ? 'h1' : 'h2'
  return (
    <>
      <span className="card-eyebrow">{content.eyebrow}</span>
      <Title className={opening ? 'card-title opening' : 'card-title'}>
        {before}
        {million && <span className="million">{million}</span>}
        {after}
      </Title>
      <p className="card-body">{content.body}</p>
      {content.modules.map((m, i) => (
        <ModuleView key={i} module={m} />
      ))}
    </>
  )
}

function ModuleView({ module: m }: { module: Module }) {
  switch (m.kind) {
    case 'stats':
      return (
        <div className="mod">
          <h3 className="mod-label">{m.label}</h3>
          <dl className="stats">
            {m.items.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>
                  <CountUp value={v} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )
    case 'rank':
      return (
        <div className="mod">
          <h3 className="mod-label">{m.label}</h3>
          <ol className="rows static">
            {m.items.map(([k, v], i) => (
              <li key={k}>
                <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                <span className="title">{k}</span>
                <span className="count">{v}</span>
              </li>
            ))}
          </ol>
        </div>
      )
    case 'chips':
      return (
        <div className="mod">
          <h3 className="mod-label">{m.label}</h3>
          <p className="codes">
            {m.items.map((code, i) => (
              <span key={i}>
                {i > 0 && <span className="arrow" aria-hidden>→</span>}
                {code}
              </span>
            ))}
          </p>
        </div>
      )
    case 'fact':
      return (
        <div className="mod fact">
          <h3 className="mod-label">Fun fact</h3>
          <p>{m.text}</p>
        </div>
      )
    case 'pass':
      return (
        <div className="mod">
          <h3 className="mod-label">{m.label}</h3>
          <div className={m.intl ? 'pass intl' : 'pass'}>
            <span className="code">{m.from[0]}</span>
            <span className="line" aria-hidden />
            <span className="code">{m.to[0]}</span>
            <span className="place">{m.from[1]}</span>
            <span className="place to">{m.to[1]}</span>
          </div>
          <dl className="pass-rows">
            {m.rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )
    case 'table':
      return (
        <div className="mod">
          <h3 className="mod-label">{m.label}</h3>
          <ol className="rows static log">
            {m.rows.map((r, i) => (
              <li key={i}>
                <span className="meta">{r[1]}</span>
                <span className="title">{r[0]}</span>
                <span className="count">{`${r[2]} mi`}</span>
              </li>
            ))}
          </ol>
        </div>
      )
    case 'nights':
      return (
        <div className="mod">
          <h3 className="mod-label">{m.label}</h3>
          <ol className="nights">
            {m.nights.map((code, i) => (
              <li key={i} className={code ? '' : 'empty'}>
                {code}
              </li>
            ))}
          </ol>
        </div>
      )
    case 'planes':
      return (
        <div className="mod">
          <h3 className="mod-label">{m.label}</h3>
          {m.planes.map((p) => (
            <PlaneCard key={p.leg} plane={p} />
          ))}
        </div>
      )
  }
}

/** An airframe: its Commons photo when there is one (credited and linked), what it was, its age and route, its story. */
function PlaneCard({ plane }: { plane: Plane }) {
  const [photo, setPhoto] = useState<Photo | null>(null)
  useEffect(() => {
    let live = true
    photoFor(plane.tail).then((p) => live && setPhoto(p))
    return () => void (live = false)
  }, [plane.tail])
  return (
    <article className="plane">
      {photo && (
        <figure>
          <img src={photoUrl(photo)} alt={photo.title} loading="lazy" onLoad={(e) => e.currentTarget.classList.add('in')} />
          <figcaption>
            <a href={photo.source} target="_blank" rel="noopener">
              {creditFor(photo)}
            </a>
          </figcaption>
        </figure>
      )}
      <h4>{plane.title}</h4>
      <p className="plane-meta">{plane.meta}</p>
      {plane.story && <p className="plane-story">{plane.story}</p>}
    </article>
  )
}

/** Seconds a counted number takes to reach its value. */
const COUNT_S = 1.4
const NUMBER = /^(\d{1,3}(,\d{3})*|\d+)(\.\d+)?$/

/** A number that counts up from zero each time it comes into view, then holds. Anything else shows as is. */
function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    const match = NUMBER.exec(value)
    if (!el || !match || reducedMotion()) return
    const target = Number(value.replace(/,/g, ''))
    const decimals = match[3] ? match[3].length - 1 : 0
    const format = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: value.includes(',') })
    let frame = 0
    const run = () => {
      const start = performance.now()
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / (COUNT_S * 1000))
        el.textContent = format(target * (1 - (1 - k) ** 3))
        if (k < 1) frame = requestAnimationFrame(step)
      }
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(step)
    }
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && run(), { threshold: 0.6 })
    observer.observe(el)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [value])
  return (
    <span ref={ref} className="num">
      {value}
    </span>
  )
}
