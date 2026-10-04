import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Line, Points, ShaderMaterial, Vector3 } from 'three'
import { distance, LAP_FRAME, LAPS, MOON_DISTANCE, MOON_POSITION, MOON_RADIUS, MOON_TRIPS, ORIGIN } from '../story/distance'

/** Height of the lapping line above the ground. */
const LAP_RADIUS = 1.04
const LAP_SAMPLES = 72
/** The figure eight's loop radii round the Earth and the Moon (Earth radii). */
const EARTH_LOOP = 1.12
const MOON_LOOP = MOON_RADIUS * 2.2
const TANGENT_SAMPLES = 24
const LOOP_SAMPLES = 160
/** The fixed bend from the coil's end onto the eight: samples, and the height it keeps over the ground. */
const BEND_SAMPLES = 64
const BEND_FLOOR = 1.035
/** Samples per full turn of the Earth loop where the bend joins it. */
const LEAD_SAMPLES = 120
/** Soft cut at the line's tail, in progress units. */
const TAIL_SOFT = 0.004
/** One brightness for the whole line, coil and eight alike, so it reads as one line. */
const LINE_OPACITY = 0.8
/** Both drawings are plain white, apart from the globe's blue and amber routes. */
const LINE = new Color('#ffffff')

interface Track {
  positions: Float32Array
  /** Distance along the track, 0 at the start to 1 at the end of what gets drawn (it may run a little past). */
  along: Float32Array
}

/**
 * The coil, sampled LAP_SAMPLES times a lap. Every lap is a full great circle (one real lap of the Earth). The laps'
 * poles follow an R2 low-discrepancy sequence over a hemisphere, so the line covers the globe evenly at every point
 * of the drawing, not just once it is finished, like a ball of yarn. Each lap runs on past a full turn to where its
 * circle first crosses the next lap's, and carries on along that one. It starts at Orlando heading due east. Same
 * construction as the story wireframe's coilPoints.
 */
const COIL = (() => {
  const { up, east, axis } = LAP_FRAME
  const turns = Math.ceil(LAPS)
  const positions = new Float32Array((turns * LAP_SAMPLES + 1) * 3)
  const pole = (i: number) => {
    const z = 1 - ((i * 0.7548776662) % 1)
    const spin = 2 * Math.PI * ((i * 0.569840291) % 1)
    const side = Math.sqrt(1 - z * z)
    return axis.clone().multiplyScalar(z).addScaledVector(up, Math.cos(spin) * side).addScaledVector(east, Math.sin(spin) * side)
  }
  const start = up.clone()
  const ahead = new Vector3()
  const crossing = new Vector3()
  const p = new Vector3()
  let current = pole(0)
  let n = 0
  for (let lap = 0; lap < turns; lap++) {
    const next = pole(lap + 1)
    ahead.crossVectors(current, start)
    // Where this circle meets the next one: the crossing reached first going forward from the lap's start.
    crossing.crossVectors(current, next).normalize()
    let past = Math.atan2(crossing.dot(ahead), crossing.dot(start))
    if (past < 0) past += Math.PI
    if (past >= Math.PI - 1e-6) past -= Math.PI
    const sweep = Math.PI * 2 + past
    for (let j = 0; j < LAP_SAMPLES; j++) {
      const theta = (j / LAP_SAMPLES) * sweep
      // Climb from the runway to orbit over the first part of the first lap.
      const climb = lap === 0 ? Math.min(1, theta / 0.9) : 1
      const r = 1.002 + (LAP_RADIUS - 1.002) * climb * climb * (3 - 2 * climb)
      p.copy(start).multiplyScalar(Math.cos(theta) * r).addScaledVector(ahead, Math.sin(theta) * r).toArray(positions, n++ * 3)
    }
    start.multiplyScalar(Math.cos(past)).addScaledVector(ahead, Math.sin(past)).normalize()
    current = next
  }
  start.multiplyScalar(LAP_RADIUS).toArray(positions, n * 3)
  return positions
})()

/** Point `laps` laps along the coil. */
function lapPoint(laps: number, target: Vector3) {
  const i = Math.min(Math.floor(laps * LAP_SAMPLES), COIL.length / 3 - 2)
  const k = laps * LAP_SAMPLES - i
  return target.fromArray(COIL, i * 3).lerp(new Vector3().fromArray(COIL, i * 3 + 3), k)
}

interface EightSample {
  u: number
  v: number
  /** How far round the trip, by arc length (0-1). */
  f: number
  /** How far round the closing loop past the Earth (0-1), or -1 elsewhere: where the trip hands over to the next. */
  home: number
}

/**
 * One trip of the figure eight, in its own plane (u toward the Moon): a straight tangent crossing out, a loop hugging
 * the Moon, the other tangent crossing home and a loop hugging the Earth. Sampled per piece, densely on the loops so
 * they stay round, sparsely on the straights. Every trip is the same eight, so one trip ends exactly where the
 * next begins.
 */
function eightTrip(): { samples: EightSample[]; length: number; homeward: number } {
  const D = MOON_DISTANCE
  const a = EARTH_LOOP
  const b = MOON_LOOP
  const al = Math.asin((a + b) / D)
  const sa = Math.sin(al)
  const ca = Math.cos(al)
  const tangent = Math.hypot(D - (a + b) * sa, (a + b) * ca)
  const arcMoon = b * (Math.PI + 2 * al)
  const arcEarth = a * (Math.PI + 2 * al)
  const total = 2 * tangent + arcMoon + arcEarth
  const out: EightSample[] = []
  const piece = (from: number, length: number, steps: number, at: (k: number) => [number, number], home = false) => {
    for (let i = 0; i < steps; i++) {
      const k = i / steps
      const [u, v] = at(k)
      out.push({ u, v, f: (from + k * length) / total, home: home ? k : -1 })
    }
  }
  const line = (p: [number, number], q: [number, number]) => (k: number): [number, number] => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]
  piece(0, tangent, TANGENT_SAMPLES, line([a * sa, a * ca], [D - b * sa, -b * ca]))
  piece(tangent, arcMoon, LOOP_SAMPLES, (k) => {
    const t = -Math.PI / 2 - al + (k * arcMoon) / b
    return [D + b * Math.cos(t), b * Math.sin(t)]
  })
  piece(tangent + arcMoon, tangent, TANGENT_SAMPLES, line([D - b * sa, b * ca], [a * sa, -a * ca]))
  piece(2 * tangent + arcMoon, arcEarth, LOOP_SAMPLES, (k) => {
    const t = -Math.PI / 2 + al - (k * arcEarth) / a
    return [a * Math.cos(t), a * Math.sin(t)]
  }, true)
  return { samples: out, length: total, homeward: (tangent + arcMoon) / total }
}

const EIGHT = eightTrip()

/** The eight's first plane: u toward the Moon, v toward Orlando's side. */
const EIGHT_U = MOON_POSITION.clone().normalize()
const EIGHT_V = ORIGIN.clone().addScaledVector(EIGHT_U, -ORIGIN.dot(EIGHT_U)).normalize()
/** Where the eight leaves its Earth loop for the Moon (falling angle in the u-v plane). */
const LOOP_EXIT = -1.5 * Math.PI - Math.asin((EARTH_LOOP + MOON_LOOP) / MOON_DISTANCE)

const loopPoint = (t: number, target: Vector3) =>
  target.copy(EIGHT_U).multiplyScalar(EARTH_LOOP * Math.cos(t)).addScaledVector(EIGHT_V, EARTH_LOOP * Math.sin(t))

/** Cubic Hermite from p0 (heading t0) to p1 (heading t1), kept off the ground. */
function hermite(p0: Vector3, t0: Vector3, p1: Vector3, t1: Vector3, k: number, target: Vector3) {
  const k2 = k * k
  const k3 = k2 * k
  const m = p0.distanceTo(p1) * 1.6
  target
    .copy(p0).multiplyScalar(2 * k3 - 3 * k2 + 1)
    .addScaledVector(t0, (k3 - 2 * k2 + k) * m)
    .addScaledVector(p1, -2 * k3 + 3 * k2)
    .addScaledVector(t1, (k3 - k2) * m)
  const r = target.length()
  if (r < BEND_FLOOR) target.multiplyScalar(BEND_FLOOR / r)
  return target
}

/**
 * The fixed bend that carries the coil's last lap onto the eight: a smooth curve from the coil's end, leaving along
 * the coil's own heading, to a point on the eight's Earth loop, arriving along the loop's heading, then round the loop
 * to where the eight heads out. The join point is picked to make the gentlest, shortest bend.
 */
function bendPoints(): Vector3[] {
  const from = lapPoint(LAPS, new Vector3())
  const fromDir = from.clone().sub(lapPoint(LAPS - 0.002, new Vector3())).normalize()
  const to = new Vector3()
  const toDir = new Vector3()
  const p = new Vector3()
  const q = new Vector3()
  const join = (s: number) => {
    loopPoint(s, to)
    toDir.copy(EIGHT_U).multiplyScalar(Math.sin(s)).addScaledVector(EIGHT_V, -Math.cos(s))
  }
  // Score each join: total turning along the bend plus its length (the loop stretch counts too).
  let best = LOOP_EXIT + Math.PI
  let bestCost = Infinity
  for (let i = 1; i <= 180; i++) {
    const s = LOOP_EXIT + 0.25 + ((Math.PI * 2 - 0.25) * i) / 180
    join(s)
    let turning = 0
    let length = EARTH_LOOP * (s - LOOP_EXIT)
    const prev = from.clone()
    const prevDir = fromDir.clone()
    for (let j = 1; j <= 32; j++) {
      hermite(from, fromDir, to, toDir, j / 32, p)
      q.subVectors(p, prev)
      length += q.length()
      q.normalize()
      turning += prevDir.angleTo(q)
      prevDir.copy(q)
      prev.copy(p)
    }
    turning += prevDir.angleTo(toDir)
    const cost = turning * 6 + length
    if (cost < bestCost) {
      bestCost = cost
      best = s
    }
  }
  join(best)
  const points: Vector3[] = []
  for (let j = 1; j < BEND_SAMPLES; j++) points.push(hermite(from, fromDir, to, toDir, j / BEND_SAMPLES, new Vector3()))
  const steps = Math.max(2, Math.ceil(((best - LOOP_EXIT) / (Math.PI * 2)) * LEAD_SAMPLES))
  for (let j = 0; j < steps; j++) points.push(loopPoint(best + ((LOOP_EXIT - best) * j) / steps, new Vector3()))
  return points
}

/** Where the coil ends and the bend onto the eight begins (for the preview's close-up). */
export const LINE_JOIN = lapPoint(LAPS, new Vector3())

/** Where the bend ends and the eight begins, in progress units (the coil runs 0 to 1). */
let EIGHT_START = 1

/**
 * The whole distance line as one track: the coil (progress 0 to 1, a lap every 1/LAPS), the bend onto the eight, then
 * MOON_TRIPS trips round the figure eight (another 1 of progress). Like the coil, the trips spread round the line they
 * share (the Earth-Moon line) like yarn: each trip's plane is turned evenly further about it, the turn happening while
 * the line loops behind the Earth, so trips join without a break. The bend is spaced at the eight's pace, so the line
 * moves along it at the same speed.
 */
function lineTrack(): Track {
  const points: Vector3[] = []
  const along: number[] = []
  const lapSamples = Math.floor(LAPS * LAP_SAMPLES)
  for (let i = 0; i <= lapSamples; i++) {
    points.push(new Vector3().fromArray(COIL, i * 3))
    along.push(i / LAP_SAMPLES / LAPS)
  }
  if (lapSamples / LAP_SAMPLES < LAPS) {
    points.push(lapPoint(LAPS, new Vector3()))
    along.push(1)
  }
  const pace = 1 / (EIGHT.length * MOON_TRIPS)
  let at = 1
  for (const p of bendPoints()) {
    at += p.distanceTo(points[points.length - 1]) * pace
    points.push(p)
    along.push(at)
  }
  const x = EIGHT_U
  const y = EIGHT_V
  const z = new Vector3().crossVectors(x, y)
  at += loopPoint(LOOP_EXIT, new Vector3()).distanceTo(points[points.length - 1]) * pace
  EIGHT_START = at
  const trips = Math.ceil(MOON_TRIPS)
  // Planes only repeat after half a turn, so spread the trips over that.
  const turn = (trip: number) => (trip * Math.PI) / trips
  for (let trip = 0; trip < trips; trip++) {
    for (const { u, v, f, home } of EIGHT.samples) {
      const k = home < 0 ? 0 : home * home * (3 - 2 * home)
      const angle = turn(trip) + (turn(trip + 1) - turn(trip)) * k
      points.push(x.clone().multiplyScalar(u).addScaledVector(y, v * Math.cos(angle)).addScaledVector(z, v * Math.sin(angle)))
      // Each trip is one unit of progress whatever its loops' size: 1 lands MOON_TRIPS of the way.
      along.push(EIGHT_START + (trip + f) / MOON_TRIPS)
    }
  }
  const positions = new Float32Array(points.length * 3)
  points.forEach((p, i) => p.toArray(positions, i * 3))
  return { positions, along: Float32Array.from(along) }
}

function trackMaterial(color: Color) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uStart: { value: 0 },
      uHead: { value: 0 },
      uOpacity: { value: 1 },
      uColor: { value: color },
      uTail: { value: 0.02 },
    },
    vertexShader: /* glsl */ `
      attribute float aAlong;
      varying float vAlong;
      void main() {
        vAlong = aAlong;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uStart;
      uniform float uHead;
      uniform float uTail;
      uniform float uOpacity;
      uniform vec3 uColor;
      varying float vAlong;
      void main() {
        if (vAlong > uHead || vAlong < uStart || uHead <= 0.0 || uOpacity <= 0.0) discard;
        // Bright near the head, settling to a steady line behind it.
        float behind = (uHead - vAlong) / uTail;
        float a = (0.55 + 1.6 * exp(-behind)) * uOpacity * smoothstep(uStart, uStart + ${TAIL_SOFT.toFixed(4)}, vAlong);
        gl_FragColor = vec4(uColor * a, a);
      }`,
  })
}

/** A glowing point at the head of a track. */
function headMaterial(color: Color) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: color }, uSize: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uSize;
      void main() {
        gl_PointSize = uSize;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 6.0) * 1.6;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.5) * a, a);
      }`,
  })
}

/**
 * The distance section's one line, driven by `distance`. It laps the Earth as many times as the log's miles would;
 * then the whole line slides along its own track, its tail pulling off the coil from Orlando while its head bends off
 * the last lap onto the figure eight to the Moon. Because it is one path, there is no seam: the bend is part of the
 * track, and the line's own body follows it. Hidden at 0.
 */
/**
 * Progress (distance.moon) at which the line leaves the Moon for the last time, starting its final crossing home:
 * the cue for the camera to head back to the globe.
 */
export const RETURN_PROGRESS = (() => {
  const lastHome = Math.floor(MOON_TRIPS - EIGHT.homeward) + EIGHT.homeward
  return (EIGHT_START - 1 + lastHome / MOON_TRIPS) / EIGHT_START
})()

export function DistanceTracks() {
  const line = useMemo(() => {
    const track = lineTrack()
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(track.positions, 3))
    geometry.setAttribute('aAlong', new BufferAttribute(track.along, 1))
    const material = trackMaterial(LINE)
    material.uniforms.uTail.value = 0.004
    const head = new BufferGeometry()
    head.setAttribute('position', new BufferAttribute(new Float32Array(3), 3))
    const dot = headMaterial(LINE)
    const lineObject = new Line(geometry, material)
    const headObject = new Points(head, dot)
    for (const o of [lineObject, headObject]) o.frustumCulled = false
    lineObject.renderOrder = 5
    headObject.renderOrder = 6
    /** Shows the stretch from `start` to `end` and puts the head exactly at `end`, between samples if need be. */
    const place = (start: number, end: number) => {
      material.uniforms.uStart.value = start
      material.uniforms.uHead.value = end
      const { along, positions } = track
      let lo = 0
      let hi = along.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (along[mid] <= end) lo = mid
        else hi = mid - 1
      }
      const next = Math.min(lo + 1, along.length - 1)
      const k = next === lo ? 0 : Math.min(1, Math.max(0, (end - along[lo]) / (along[next] - along[lo])))
      const h = head.getAttribute('position') as BufferAttribute
      const at = (c: number) => positions[lo * 3 + c] + (positions[next * 3 + c] - positions[lo * 3 + c]) * k
      h.setXYZ(0, at(0), at(1), at(2))
      h.needsUpdate = true
    }
    return { lineObject, headObject, material, dot, place }
  }, [])
  useFrame(({ gl }) => {
    line.material.uniforms.uOpacity.value = distance.fade * LINE_OPACITY
    const u = distance.moon
    // Lapping: the line grows from Orlando. Unspooling: tail and head slide on together until the coil is gone and
    // the eight is whole.
    if (u > 0) line.place(u, 1 + EIGHT_START * u)
    else line.place(0, distance.laps)
    const moving = (distance.laps > 0 && distance.laps < 1 && u === 0) || (u > 0 && u < 1)
    line.dot.uniforms.uSize.value = moving ? 14 * gl.getPixelRatio() * distance.fade : 0
  })
  return (
    <group>
      <primitive object={line.lineObject} />
      <primitive object={line.headObject} />
    </group>
  )
}
