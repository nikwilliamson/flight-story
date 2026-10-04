import { CanvasTexture, LinearFilter } from 'three'
import { airports, legs } from '../data'

const WIDTH = 1024
const HEIGHT = 512
const SAMPLES = 64
const DEG = Math.PI / 180

/** Points along the great circle between two lat/lon pairs, as [lon, lat] in degrees. */
function greatCircle(lat1: number, lon1: number, lat2: number, lon2: number): [number, number][] {
  const a = [Math.cos(lat1 * DEG) * Math.cos(lon1 * DEG), Math.cos(lat1 * DEG) * Math.sin(lon1 * DEG), Math.sin(lat1 * DEG)]
  const b = [Math.cos(lat2 * DEG) * Math.cos(lon2 * DEG), Math.cos(lat2 * DEG) * Math.sin(lon2 * DEG), Math.sin(lat2 * DEG)]
  const omega = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
  if (omega < 1e-6) return [[lon1, lat1]]
  const points: [number, number][] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES
    const ka = Math.sin((1 - t) * omega) / Math.sin(omega)
    const kb = Math.sin(t * omega) / Math.sin(omega)
    const [x, y, z] = [0, 1, 2].map((k) => a[k] * ka + b[k] * kb)
    points.push([Math.atan2(y, x) / DEG, Math.asin(z / Math.hypot(x, y, z)) / DEG])
  }
  return points
}

const x = (lon: number) => ((lon + 180) / 360) * WIDTH
const y = (lat: number) => ((90 - lat) / 180) * HEIGHT

/** Each leg's ground track as a canvas path, or null for ground hops and unknown airports. */
const tracks = legs.map((leg) => {
  if (leg.from < 0 || leg.to < 0 || leg.from === leg.to) return null
  const from = airports[leg.from]
  const to = airports[leg.to]
  const points = greatCircle(from.lat, from.lon, to.lat, to.lon)
  const path = new Path2D()
  points.forEach(([lon, lat], i) => {
    // Break the stroke where the track wraps across the antimeridian.
    if (i === 0 || Math.abs(lon - points[i - 1][0]) > 180) path.moveTo(x(lon), y(lat))
    else path.lineTo(x(lon), y(lat))
  })
  return path
})

function canvas() {
  const c = document.createElement('canvas')
  c.width = WIDTH
  c.height = HEIGHT
  return c
}

/**
 * Equirectangular density of the routes flown so far, blurred: where the fog gathers light from the flying.
 * Tracks are stroked onto a 1024x512 canvas as legs land (a seek backwards redraws from scratch); the blurred
 * copy the shader samples is rebuilt only when asked, so the cost stays off most frames.
 */
export class RouteField {
  readonly texture: CanvasTexture
  private lines = canvas()
  private field = canvas()
  private drawn = 0

  constructor() {
    this.texture = new CanvasTexture(this.field)
    this.texture.minFilter = LinearFilter
    this.texture.generateMipmaps = false
    this.clear()
    this.draw(legs.length)
  }

  private clear() {
    const ctx = this.lines.getContext('2d')!
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    this.drawn = 0
  }

  /** Brings the field to the first `count` legs. */
  draw(count: number) {
    if (count === this.drawn) return
    if (count < this.drawn) this.clear()
    const ctx = this.lines.getContext('2d')!
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 2
    for (let i = this.drawn; i < count; i++) {
      const path = tracks[i]
      if (path) ctx.stroke(path)
    }
    this.drawn = count

    const out = this.field.getContext('2d')!
    out.globalCompositeOperation = 'source-over'
    out.globalAlpha = 1
    out.filter = 'none'
    out.fillStyle = '#000'
    out.fillRect(0, 0, WIDTH, HEIGHT)
    out.filter = 'blur(10px)'
    out.drawImage(this.lines, 0, 0)
    out.filter = 'blur(2px)'
    out.globalCompositeOperation = 'lighter'
    out.globalAlpha = 0.6
    out.drawImage(this.lines, 0, 0)
    this.texture.needsUpdate = true
  }
}
