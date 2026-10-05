import { DataTexture, LinearFilter, RedFormat } from 'three'
import { airports, legs } from '../data'

const WIDTH = 256
const HEIGHT = 128
/** Texels of the 1024x512 field this was first drawn at, per texel here: line weights and blurs scale by it. */
const SCALE = 4
const SAMPLES = 64
const DEG = Math.PI / 180
/** Each track adds this much per texel it crosses: a 2 px stroke at 6% white, at the old resolution. */
const STROKE = (0.06 * 2) / SCALE
/** Where overlapping strokes saturate: a full-white 2 px stroke covers half a texel. */
const CAP = 2 / SCALE
/** The wide glow: three box passes of this radius make a Gaussian of sigma ~2.5 texels (the old blur(10px)). */
const GLOW_RADIUS = 2

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

const x = (lon: number) => ((lon + 180) / 360) * WIDTH - 0.5
// Row 0 is the south pole, as the shader's uv.y runs, so the data uploads unflipped.
const y = (lat: number) => ((lat + 90) / 180) * HEIGHT - 0.5

/**
 * Each leg's ground track as texel-space splat points, a weight per point, or null for ground hops and unknown
 * airports. Points sit at most half a texel apart, so a bilinear splat of each lays down an even line.
 */
const tracks = legs.map((leg) => {
  if (leg.from < 0 || leg.to < 0 || leg.from === leg.to) return null
  const from = airports[leg.from]
  const to = airports[leg.to]
  const points = greatCircle(from.lat, from.lon, to.lat, to.lon)
  const out: number[] = []
  for (let i = 1; i < points.length; i++) {
    const [lon0, lat0] = points[i - 1]
    const [lon1, lat1] = points[i]
    // No segment across the antimeridian.
    if (Math.abs(lon1 - lon0) > 180) continue
    const [x0, y0, x1, y1] = [x(lon0), y(lat0), x(lon1), y(lat1)]
    const length = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(1, Math.ceil(length * 2))
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n
      out.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, (length / n) * STROKE)
    }
  }
  return Float32Array.from(out)
})

/** One box-blur pass of radius r along rows (wrapping round the antimeridian) or columns (clamped at the poles). */
function boxBlur(src: Float32Array, dst: Float32Array, r: number, horizontal: boolean) {
  const span = horizontal ? WIDTH : HEIGHT
  const lines = horizontal ? HEIGHT : WIDTH
  const step = horizontal ? 1 : WIDTH
  const norm = 1 / (2 * r + 1)
  const at = (k: number) => (horizontal ? (k + span) % span : Math.min(span - 1, Math.max(0, k)))
  for (let l = 0; l < lines; l++) {
    const base = horizontal ? l * WIDTH : l
    let sum = 0
    for (let k = -r; k <= r; k++) sum += src[base + at(k) * step]
    for (let k = 0; k < span; k++) {
      dst[base + k * step] = sum * norm
      sum += src[base + at(k + r + 1) * step] - src[base + at(k - r) * step]
    }
  }
}

/**
 * Equirectangular density of the routes flown so far, blurred: where the fog gathers light from the flying.
 * Tracks are splatted into a small float buffer as legs land (a seek backwards redraws from scratch); the blurred
 * copy the shader samples is rebuilt only when asked, so the cost stays off most frames. All on the CPU at 256x128
 * (a 32 KB upload): canvas filters are missing on Safari before 18, and the field is soft enough not to need more.
 */
export class RouteField {
  readonly texture: DataTexture
  private lines = new Float32Array(WIDTH * HEIGHT)
  private a = new Float32Array(WIDTH * HEIGHT)
  private b = new Float32Array(WIDTH * HEIGHT)
  private out = new Uint8Array(WIDTH * HEIGHT)
  private drawn = 0

  constructor() {
    this.texture = new DataTexture(this.out, WIDTH, HEIGHT, RedFormat)
    this.texture.minFilter = LinearFilter
    this.texture.magFilter = LinearFilter
    this.texture.unpackAlignment = 1
    this.draw(legs.length)
  }

  /** Brings the field to the first `count` legs. */
  draw(count: number) {
    if (count === this.drawn) return
    if (count < this.drawn) {
      this.lines.fill(0)
      this.drawn = 0
    }
    const lines = this.lines
    for (let i = this.drawn; i < count; i++) {
      const track = tracks[i]
      if (!track) continue
      for (let j = 0; j < track.length; j += 3) {
        const x0 = Math.floor(track[j])
        const y0 = Math.floor(track[j + 1])
        const fx = track[j] - x0
        const fy = track[j + 1] - y0
        const w = track[j + 2]
        // Wrap east-west, clamp at the poles.
        const xa = (x0 + WIDTH) % WIDTH
        const xb = (x0 + 1) % WIDTH
        const ya = Math.max(0, y0) * WIDTH
        const yb = Math.min(HEIGHT - 1, y0 + 1) * WIDTH
        lines[ya + xa] += w * (1 - fx) * (1 - fy)
        lines[ya + xb] += w * fx * (1 - fy)
        lines[yb + xa] += w * (1 - fx) * fy
        lines[yb + xb] += w * fx * fy
      }
    }
    this.drawn = count

    // The old canvas added strokes with 'lighter', which saturates; the glow is blurred from the saturated lines.
    const { a, b, out } = this
    for (let i = 0; i < a.length; i++) a[i] = Math.min(lines[i], CAP)
    for (let pass = 0; pass < 3; pass++) {
      boxBlur(a, b, GLOW_RADIUS, true)
      boxBlur(b, a, GLOW_RADIUS, false)
    }
    // Wide glow plus the lines themselves at 60%, which the bilinear splat and texture filtering soften like blur(2px).
    for (let i = 0; i < out.length; i++) out[i] = Math.min(255, (a[i] + 0.6 * Math.min(lines[i], CAP)) * 255 + 0.5)
    this.texture.needsUpdate = true
  }
}
