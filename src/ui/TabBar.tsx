import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { atEnd, TABS } from '../explore/explore'
import { useStory } from '../state/store'
import { Glass } from './Glass'
import { Hit, bodyWidth } from './interactive'
import { Label } from './Label'
import type { Layout } from './layout'
import { ui } from './tokens'

const HEIGHT = 32
const SPACING = 6
/** How far the bar rises as it slides in. */
const SLIDE = 24

export const tabBarBottom = (layout: Layout) => (layout.phone ? layout.stage.height - 8 : 24 + HEIGHT * layout.scale)

/**
 * The tabs, which slide in once the story's last card locks: Explore, Trips, Airports, Planes, Airlines, Log. Desktop:
 * across the top of the card column. Phone: along the bottom of the pinned globe.
 */
export function TabBar({ layout }: { layout: Layout }) {
  const s = layout.scale
  const group = useRef<Group>(null)
  const shown = useRef(0)
  const tab = useStory((st) => st.tab)
  const [over, setOver] = useState<string | null>(null)
  const room = layout.phone ? layout.stage.width - 16 : layout.card.width
  // Shrink to fit the row (phones): text, padding and gaps scale together.
  const natural = TABS.reduce((sum, t) => sum + bodyWidth(t.label, 13 * s) + 26 * s, 0) + SPACING * s * (TABS.length - 1)
  const k = Math.min(1, room / natural)
  const size = 13 * s * k
  const pad = 13 * s * k
  const gap = SPACING * s * k
  const h = HEIGHT * s
  const widths = TABS.map((t) => bodyWidth(t.label, size) + 2 * pad)
  const total = widths.reduce((a, b) => a + b, 0) + gap * (TABS.length - 1)
  const x0 = layout.phone ? Math.max(8, (layout.stage.width - total) / 2) : layout.card.x
  const y0 = layout.phone ? layout.stage.height - h - 8 * s : 24

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    const target = atEnd() ? 1 : 0
    shown.current += (target - shown.current) * (1 - Math.exp(-Math.min(delta, 0.1) * 6))
    if (Math.abs(target - shown.current) < 0.002) shown.current = target
    g.visible = shown.current > 0.01
    g.position.y = -SLIDE * (1 - shown.current)
  })

  let x = x0
  return (
    <group ref={group} visible={false}>
      {TABS.map((t, i) => {
        const w = widths[i]
        const cx = x
        x += w + gap
        const active = tab === t.id
        const lit = active || over === t.id
        return (
          <group key={t.id}>
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
                setOver(t.id)
                document.body.style.cursor = 'pointer'
              }}
              onPointerOut={() => {
                setOver(null)
                document.body.style.cursor = ''
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (!atEnd()) return
                // Clicking the open tab closes it, back to the closing card.
                useStory.getState().setTab(active ? null : t.id)
                history.replaceState(null, '', active ? location.pathname : `#${t.id}`)
              }}
            />
          </group>
        )
      })}
    </group>
  )
}
