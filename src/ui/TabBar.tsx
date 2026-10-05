import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { backToStory, openTab, TABS } from '../explore/explore'
import { useStory } from '../state/store'
import { Glass } from './Glass'
import { Hit, bodyWidth } from './interactive'
import { Label } from './Label'
import { RAIL_REACH } from './Rail'
import type { Layout } from './layout'
import { ui } from './tokens'

const HEIGHT = 32
const SPACING = 6
/** How far the bar rises as it slides in. */
const SLIDE = 24

/** The year readout's widest line, so centred tabs never run under it. */
const HUD_WIDTH = 230

export const tabBarBottom = (layout: Layout) => (layout.phone ? layout.stage.height - 8 : 24 + HEIGHT * layout.scale)

/** The bar's tabs: Journey (the story) first (lit while no tab is open), then the explore tabs. */
const BAR: { id: (typeof TABS)[number]['id'] | null; label: string }[] = [{ id: null, label: 'Journey' }, ...TABS]

/**
 * The tabs, always on (Nik), sliding in once the page has loaded: Journey, Explore, Trips, Airports, Aircraft,
 * Airlines, Log. Desktop: across the top of the card column. Phone: along the bottom of the pinned globe.
 */
export function TabBar({ layout }: { layout: Layout }) {
  const s = layout.scale
  const group = useRef<Group>(null)
  const shown = useRef(0)
  const tab = useStory((st) => st.tab)
  const [over, setOver] = useState<string | null>(null)
  // Centred on the page. Desktop keeps both sides clear of the year readout and the rail at the top right.
  const page = layout.stage.x + layout.stage.width
  const room = page - (layout.phone ? 16 : 2 * (RAIL_REACH + HUD_WIDTH))
  // Shrink to fit the row (phones): text, padding and gaps scale together.
  const natural = BAR.reduce((sum, t) => sum + bodyWidth(t.label, 13 * s) + 26 * s, 0) + SPACING * s * (BAR.length - 1)
  const k = Math.min(1, room / natural)
  const size = 13 * s * k
  const pad = 13 * s * k
  const gap = SPACING * s * k
  const h = HEIGHT * s
  const widths = BAR.map((t) => bodyWidth(t.label, size) + 2 * pad)
  const total = widths.reduce((a, b) => a + b, 0) + gap * (BAR.length - 1)
  const x0 = Math.max(8, (page - total) / 2)
  const y0 = layout.phone ? layout.stage.height - h - 8 * s : 24

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    const target = 1
    shown.current += (target - shown.current) * (1 - Math.exp(-Math.min(delta, 0.1) * 6))
    if (Math.abs(target - shown.current) < 0.002) shown.current = target
    g.visible = shown.current > 0.01
    g.position.y = -SLIDE * (1 - shown.current)
  })

  let x = x0
  return (
    <group ref={group} visible={false}>
      {BAR.map((t, i) => {
        const w = widths[i]
        const cx = x
        x += w + gap
        const active = tab === t.id
        const lit = active || over === t.label
        return (
          <group key={t.label}>
            <Glass x={cx} y={y0} width={w} height={h} radius={h / 2} glow={active ? 0.7 : 0} fill={lit ? 0.95 : 0.6} color={ui.chip} />
            <Label x={cx + w / 2} y={y0 + (h - size * 1.2) / 2} size={size} color={active ? ui.international : lit ? ui.ink : ui.inkDim} align="center" lineHeight={1.2}>
              {t.label}
            </Label>
            <Hit
              x={cx}
              y={y0}
              width={w}
              height={h}
              onPointerOver={(e) => {
                e.stopPropagation()
                setOver(t.label)
                document.body.style.cursor = 'pointer'
              }}
              onPointerOut={() => {
                setOver(null)
                document.body.style.cursor = ''
              }}
              onClick={(e) => {
                e.stopPropagation()
                // Journey, or the open tab again, closes it, back to the journey where the reader left it.
                if (t.id === null || active) backToStory()
                else openTab(t.id)
              }}
            />
          </group>
        )
      })}
    </group>
  )
}
