import { fonts } from './fonts'
import { glass, panel, radius, size, space, type, ui } from './tokens'

// The HTML chrome uses the scene's own type: register the same files the SDF text reads.
const faces: [string, string, string][] = [
  ['Story Display', fonts.display, '600'],
  ['Story Display', fonts.displayMedium, '500'],
  ['Story Body', fonts.body, '400'],
  ['Story Mono', fonts.mono, '400'],
]
for (const [family, url, weight] of faces) new FontFace(family, `url(${url})`, { weight }).load().then((f) => document.fonts.add(f), () => {})

const hex = (c: { getHexString(): string }) => `#${c.getHexString()}`
const rgb = (c: { r: number; g: number; b: number }) => [c.r, c.g, c.b].map((v) => Math.round(v * 255)).join(' ')

/** tokens.ts as CSS custom properties, so styles.css never repeats a value. */
const vars: Record<string, string | number> = {
  '--ink': hex(ui.ink),
  '--ink-dim': hex(ui.inkDim),
  '--ink-faint': hex(ui.inkFaint),
  '--accent': hex(ui.accent),
  '--domestic': hex(ui.domestic),
  '--international': hex(ui.international),
  '--helicopter': hex(ui.helicopter),
  '--glass-rgb': rgb(ui.glass),
  '--chip-rgb': rgb(ui.chip),
  '--edge-rgb': rgb(ui.edge),
  '--glass-fill': glass.fill,
  '--panel-fill': panel.css,
  '--radius-panel': `${radius.panel}px`,
  '--radius-inner': `${radius.inner}px`,
  '--row': `${size.row}px`,
  '--rank': `${size.rank}px`,
  '--pill': `${size.pill}px`,
  '--pill-s': `${size.pillS}px`,
}
for (const [k, v] of Object.entries(space)) vars[`--space-${k}`] = `${v}px`
for (const [name, role] of Object.entries(type)) {
  const id = name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
  vars[`--${id}`] = `${role.family === 'Story Display' && role.font === fonts.display ? 600 : role.family === 'Story Display' ? 500 : 400} ${role.size}px/${role.line} '${role.family}', system-ui, sans-serif`
  vars[`--${id}-tracking`] = `${role.tracking}em`
}
for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, String(v))

const canvas = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null

/**
 * A text's advance in px, measured with the real font once the browser has it (the same file troika draws with),
 * otherwise estimated: mono is exact at 0.6 em, proportional text averages about 0.56 em.
 */
export function textWidth(text: string, role: keyof typeof type, scale = 1) {
  const r = type[role]
  const px = r.size * scale
  const shown = r.upper ? text.toUpperCase() : text
  const tracking = r.tracking * px * shown.length
  if (r.font === fonts.mono) return shown.length * 0.6 * px + tracking
  const css = `${r.font === fonts.display ? 600 : r.family === 'Story Display' ? 500 : 400} ${px}px '${r.family}'`
  if (canvas && document.fonts.check(css)) {
    canvas.font = css
    return canvas.measureText(shown).width + tracking
  }
  return shown.length * 0.56 * px + tracking
}
