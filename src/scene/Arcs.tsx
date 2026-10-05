import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, CustomBlending, Mesh, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, Vector2, Vector3 } from 'three'
import { airports, legs } from '../data'
import { angleBetween, arcPoints, latLonToVec3 } from '../geo'
import { palette } from '../theme'
import { useTerrain, type TerrainRadius } from './terrain'
import { FLIGHT, legStart, STORY_END, timeline } from '../story/timeline'
import { distance } from '../story/distance'
import { reducedMotion } from '../motion'
import { DIM, highlight } from './highlight'

/** Matches aKind in the shader. */
const enum Kind {
  Domestic = 0,
  International = 1,
  /** Unknown destination: a trail from the known airport that dissolves before it arrives anywhere. */
  UnknownOut = 2,
  Ground = 3,
  /** Unknown origin: a trail that condenses out of nothing on its way into the known airport. */
  UnknownIn = 4,
  Helicopter = 5,
}

/** Mean direction of a leg's likely airports, where its trail points. */
function candidateCentre(candidates: number[], airportVec: Vector3[], radius: number) {
  const sum = candidates.reduce((acc, c) => acc.add(airportVec[c].clone().normalize()), new Vector3())
  return sum.normalize().multiplyScalar(radius)
}

const SAMPLES = 48

interface ArcSpec {
  a: Vector3
  b: Vector3
  start: number
  kind: Kind
  /** Leg index (id - 1): the arc's slot in the highlight texture. */
  leg: number
}

function collectArcs(terrain: TerrainRadius): ArcSpec[] {
  const airportVec = airports.map((a) => latLonToVec3(a.lat, a.lon, terrain(a.lat, a.lon) + 0.002))
  const arcs: ArcSpec[] = []
  legs.forEach((leg, i) => {
    const known = leg.from >= 0 ? leg.from : leg.to
    if (leg.candidates.length && known >= 0) {
      const home = airportVec[known]
      const away = candidateCentre(leg.candidates, airportVec, home.length())
      arcs.push(leg.from >= 0 ? { a: home, b: away, start: legStart[i], kind: Kind.UnknownOut, leg: i } : { a: away, b: home, start: legStart[i], kind: Kind.UnknownIn, leg: i })
    } else if (leg.from >= 0 && leg.to >= 0 && leg.from !== leg.to) {
      arcs.push({ a: airportVec[leg.from], b: airportVec[leg.to], start: legStart[i], kind: leg.type === 'Helicopter' ? Kind.Helicopter : leg.intl ? Kind.International : Kind.Domestic, leg: i })
    }
    const prev = legs[i - 1]
    if (leg.ground && prev && prev.to >= 0 && leg.from >= 0 && prev.to !== leg.from) {
      arcs.push({ a: airportVec[prev.to], b: airportVec[leg.from], start: legStart[i] - 0.04, kind: Kind.Ground, leg: i })
    }
  })
  return arcs
}

/**
 * Each flight's arch height: low and proportional for short hops (so they don't spike up when the story camera flies
 * in close), rising with distance so the long hauls clearly arch over everything else. Repeats of a route fan out a
 * little (±3%), so a route flown a hundred times reads as a bundle of strands, not one over-bright line.
 */
function liftsFor(arcs: ArcSpec[]) {
  const routeKey = (arc: ArcSpec) => {
    const [a, b] = [arc.a.toArray().join(), arc.b.toArray().join()]
    return a < b ? `${a}|${b}` : `${b}|${a}`
  }
  const totals = new Map<string, number>()
  for (const arc of arcs) if (arc.kind !== Kind.Ground) totals.set(routeKey(arc), (totals.get(routeKey(arc)) ?? 0) + 1)
  const seen = new Map<string, number>()
  return arcs.map((arc) => {
    const omega = angleBetween(arc.a, arc.b)
    if (arc.kind === Kind.Ground) return Math.min(0.004, omega * 0.2)
    const key = routeKey(arc)
    const n = totals.get(key)!
    const k = seen.get(key) ?? 0
    seen.set(key, k + 1)
    const fan = n > 1 ? 1 + FAN * (k / (n - 1) - 0.5) : 1
    return (Math.min(0.03, omega * 0.35) + LONG_LIFT * (omega / Math.PI) ** 1.2) * fan
  })
}

/** Long-haul arch: an antipodal route rises this far (globe radii); and how wide repeats of a route fan out. */
const LONG_LIFT = 0.34
const FAN = 0.06

/** Where each leg's arcs sit in the index buffer, for drawing the lit ones again in their own pass. */
export type IndexRanges = Map<number, [number, number][]>

/** One merged ribbon mesh for every arc: 2 vertices per sample, expanded to screen-space width in the shader. */
function buildGeometry(arcs: ArcSpec[]): { geometry: BufferGeometry; ranges: IndexRanges } {
  const verts = arcs.length * (SAMPLES + 1) * 2
  const position = new Float32Array(verts * 3)
  const prev = new Float32Array(verts * 3)
  const next = new Float32Array(verts * 3)
  const side = new Float32Array(verts)
  const t = new Float32Array(verts)
  const start = new Float32Array(verts)
  const kind = new Float32Array(verts)
  const span = new Float32Array(verts)
  const legIndex = new Float32Array(verts)
  const index: number[] = []
  const ranges: IndexRanges = new Map()
  const lifts = liftsFor(arcs)
  let v = 0
  arcs.forEach((arc, n) => {
    const omega = angleBetween(arc.a, arc.b)
    const pts = arcPoints(arc.a, arc.b, SAMPLES, lifts[n])
    const first = index.length
    const base = v
    pts.forEach((p, i) => {
      const pp = pts[Math.max(0, i - 1)]
      const pn = pts[Math.min(SAMPLES, i + 1)]
      for (const s of [-1, 1]) {
        p.toArray(position, v * 3)
        pp.toArray(prev, v * 3)
        pn.toArray(next, v * 3)
        side[v] = s
        t[v] = i / SAMPLES
        start[v] = arc.start
        kind[v] = arc.kind
        span[v] = omega
        legIndex[v] = arc.leg
        v++
      }
      if (i < SAMPLES) {
        const k = base + i * 2
        index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
      }
    })
    ranges.set(arc.leg, [...(ranges.get(arc.leg) ?? []), [first, index.length - first]])
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(position, 3))
  g.setAttribute('aPrev', new BufferAttribute(prev, 3))
  g.setAttribute('aNext', new BufferAttribute(next, 3))
  g.setAttribute('aSide', new BufferAttribute(side, 1))
  g.setAttribute('aT', new BufferAttribute(t, 1))
  g.setAttribute('aStart', new BufferAttribute(start, 1))
  g.setAttribute('aKind', new BufferAttribute(kind, 1))
  g.setAttribute('aSpan', new BufferAttribute(span, 1))
  g.setAttribute('aLeg', new BufferAttribute(legIndex, 1))
  g.setIndex(new BufferAttribute(new Uint32Array(index), 1))
  return { geometry: g, ranges }
}

/** The lit pass: the same vertices, indexed to only the legs that are lit or still fading out. */
function litIndex(base: BufferGeometry, ranges: IndexRanges, legsLit: readonly number[]) {
  const src = base.index!.array as Uint32Array
  let total = 0
  for (const leg of legsLit) for (const [, count] of ranges.get(leg) ?? []) total += count
  const out = new Uint32Array(total)
  let at = 0
  for (const leg of legsLit)
    for (const [start, count] of ranges.get(leg) ?? []) {
      out.set(src.subarray(start, start + count), at)
      at += count
    }
  return new BufferAttribute(out, 1)
}

/** Seconds a lit leg's direction pulse takes to come round. */
const PULSE_PERIOD = 2.4

const vertexShader = /* glsl */ `
  uniform vec2 uResolution;
  uniform float uWidth;
  uniform sampler2D uHighlight;
  uniform float uHighlightWidth;
  uniform float uClose;
  attribute vec3 aPrev;
  attribute vec3 aNext;
  attribute float aSide;
  attribute float aT;
  attribute float aStart;
  attribute float aKind;
  attribute float aSpan;
  attribute float aLeg;
  varying float vHighlight;
  varying float vShare;
  varying float vOrder;
  varying float vT;
  varying float vSpan;
  varying float vStart;
  varying float vKind;
  varying float vSide;
  varying float vWidth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 tangent = normalize((modelViewMatrix * vec4(aNext - aPrev, 0.0)).xyz + 1e-6);
    vec3 side = normalize(cross(tangent, normalize(-mv.xyz)));
    // World units per screen pixel at this depth, so the ribbon keeps a constant pixel width.
    float pixel = 2.0 * -mv.z / (projectionMatrix[1][1] * uResolution.y);
    ivec2 texel = ivec2(int(mod(aLeg, uHighlightWidth)), int(aLeg / uHighlightWidth));
    vec3 lit = texelFetch(uHighlight, texel, 0).rgb;
    vHighlight = lit.r;
    vShare = lit.g;
    vOrder = lit.b;
    // Lit legs keep the same width (Nik): they stand out by colour, not weight.
    float width = uWidth * (aKind > 2.5 && aKind < 3.5 ? 0.8 : 1.0);
    // One extra pixel for the antialiased edge the fragment shader feathers.
    mv.xyz += side * aSide * (width + 1.0) * 0.5 * pixel;
    vSide = aSide;
    vWidth = width;
    gl_Position = projectionMatrix * mv;
    vT = aT;
    vStart = aStart;
    vKind = aKind;
    vSpan = aSpan;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uShow;
  uniform float uTime;
  uniform float uFlight;
  uniform float uTripStart;
  uniform float uHistory;
  uniform float uGhost;
  uniform float uDim;
  uniform float uReveal;
  uniform vec3 uDomestic;
  uniform vec3 uInternational;
  uniform vec3 uGround;
  uniform vec3 uHelicopter;
  uniform vec3 uSlate;
  uniform float uClose;
  uniform float uPass;
  uniform float uClock;
  uniform float uPulse;
  varying float vSide;
  varying float vWidth;
  varying float vT;
  varying float vStart;
  varying float vKind;
  varying float vSpan;
  varying float vHighlight;
  varying float vShare;
  varying float vOrder;
  void main() {
    float age = (uTime - vStart) / uFlight;             // in flight-durations since takeoff
    float lin = clamp(age, 0.0, 1.0);
    // Cubic ease in-out: the plane eases off the runway, runs fast at cruise, and settles onto landing.
    float p = lin < 0.5 ? 4.0 * lin * lin * lin : 1.0 - pow(2.0 - 2.0 * lin, 3.0) * 0.5;   // 0 before takeoff, 1 after landing
    float flown = 1.0 - step(p, vT);                      // this sample is behind the plane
    // Bright comet trail; it fades out after landing instead of staying parked at the destination,
    // where hundreds of them would pile into a glare. Hubs glow from the airport sprite instead.
    float head = smoothstep(0.14, 0.0, p - vT) * flown * (1.0 - smoothstep(1.0, 1.6, age));

    vec3 color = vKind > 0.5 && vKind < 1.5 ? uInternational : uDomestic;
    float ghost = uGhost * (vKind < 0.5 ? 0.7 : 1.0);   // dense domestic routes would otherwise wash out
    // During the story the current trip stays bright and everything before it settles into dim history.
    // While a group is highlighted the current trip loses its boost too, so every route outside the group sinks to the
    // same dim history look (Nik), not just the older ones.
    ghost *= vStart >= uTripStart - 0.001 ? mix(2.4, uHistory, uDim) : uHistory;
    float pattern = 1.0;
    if (vKind > 2.5 && vKind < 3.5) { color = uGround; ghost *= 0.5; pattern = step(0.5, fract(vT * 30.0)); }   // by land
    // Unknown airport: solid, and gone well before the unknown end, so the trail just trails off.
    if (vKind > 1.5 && vKind < 2.5) pattern *= 1.0 - smoothstep(0.1, 0.7, vT);
    if (vKind > 3.5 && vKind < 4.5) pattern *= smoothstep(0.3, 0.9, vT);
    // Helicopters: a handful of short hops in their own colour, kept at current-trip strength so they read on the tour
    // chapter without lighting them up and dimming everything else (Nik).
    if (vKind > 4.5) { color = uHelicopter; ghost = uGhost * mix(3.2, uHistory, uDim); }

    // Brightest at the apex and softer at the airports, like the light trails in the reference.
    // Routes dissolve over the last ~250 km into each airport, so hubs glow from the airport
    // sprite rather than from hundreds of overlapping lines. Measured in radians, so long and
    // short routes clear the same radius.
    // Zoomed in, both shrink with the view (Nik: lines tapered far too thin close up), so a route stays full
    // strength across the screen and only clears the last few pixels into the airport.
    float k = mix(1.0, 0.15, uClose);
    float endFade = smoothstep(0.006 * k, 0.04 * k, min(vT, 1.0 - vT) * vSpan);
    float apex = mix(0.55 + 0.45 * sin(3.14159 * vT), 1.0, uClose) * endFade;
    // The line is laid down behind the plane as it flies, already at its settled look, so an arc draws itself
    // from A to B and simply stays; the comet head is the only thing that comes and goes.
    float a = max(head * 2.4, ghost * apex * flown) * pattern;
    // Highlight: lit legs fade to white at full strength, everything else dims (both eased on the CPU). In an aside
    // a lit leg the timeline hasn't reached yet fades in whole.
    // Only a touch brighter than a line of the current chapter (Nik): white, not a glare.
    // Each lit line carries only its share of the glow, so the busiest sets don't stack into one bloomed blob.
    float lit = max(a, min(1.0, uGhost * 2.6) * apex * max(flown, uReveal) * pattern) * vShare;
    // A committed set shows its direction: a soft pulse runs along each lit leg from takeoff to landing, the legs
    // taking turns in their own order like a relay.
    float run = fract(uClock / ${PULSE_PERIOD.toFixed(1)} - vOrder * 0.6);
    lit *= 1.0 + 0.9 * uPulse * smoothstep(0.1, 0.0, abs(vT - run)) * max(flown, uReveal);
    if (uPass < 0.5) {
      // The field: while a set is lit, everything else dims and drains toward slate, so white reads against grey,
      // not against cyan and amber.
      a *= (1.0 - ${DIM.toFixed(2)} * uDim) * (1.0 - vHighlight);
      color = mix(color, uSlate, 0.7 * uDim);
    } else {
      // The lit pass, drawn over the field (not added into it), white.
      a = lit * vHighlight;
      color = vec3(1.0);
    }
    // Feathered edge, about a pixel wide, so the ribbon reads smooth rather than stair-stepped.
    a *= clamp((1.0 - abs(vSide)) * (vWidth + 1.0) * 0.5 + 0.25, 0.0, 1.0);
    gl_FragColor = vec4(color * a, a) * uShow;
  }
`

/** Route width in CSS px at the opening view (Nik: 1.1 read too thin). */
const WIDTH = 1.6

function makeMaterial(pass: 0 | 1) {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    // The field adds up like light; the lit pass lies over it (premultiplied "over"), so a busy set can't stack into a blob.
    ...(pass ? { blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor } : { blending: AdditiveBlending }),
    uniforms: {
      uPass: { value: pass },
      uClock: { value: 0 },
      uPulse: { value: 0 },
      uSlate: { value: palette.slate },
      uShow: { value: 1 },
      uResolution: { value: new Vector2() },
      uWidth: { value: WIDTH },
      uClose: { value: 0 },
      uTime: { value: 0 },
      uFlight: { value: FLIGHT },
      uTripStart: { value: 1e9 },
      uHistory: { value: 1 },
      uGhost: { value: 0.36 },
      uDim: { value: 0 },
      uReveal: { value: 0 },
      uHighlight: { value: highlight.texture },
      uHighlightWidth: { value: highlight.width },
      uDomestic: { value: palette.domestic },
      uInternational: { value: palette.international },
      uGround: { value: palette.ground },
      uHelicopter: { value: palette.helicopter },
    },
  })
}

export function Arcs() {
  const terrain = useTerrain()
  const { geometry, ranges } = useMemo(() => buildGeometry(collectArcs(terrain)), [terrain])
  const lit = useMemo(() => {
    const g = new BufferGeometry()
    for (const [name, attr] of Object.entries(geometry.attributes)) g.setAttribute(name, attr)
    return g
  }, [geometry])
  const materials = useMemo(() => [makeMaterial(0), makeMaterial(1)] as const, [])
  const { size, viewport } = useThree()
  const mesh = useRef<Mesh>(null)
  const litMesh = useRef<Mesh>(null)
  const version = useRef(-1)
  useFrame(({ camera, clock }) => {
    if (highlight.version !== version.current) {
      version.current = highlight.version
      lit.setIndex(litIndex(geometry, ranges, highlight.members))
    }
    // 0 at the opening view, 1 near the ground: lines thicken a little and stop tapering as the camera closes in.
    const c = Math.min(1, Math.max(0, (3 - camera.position.length()) / 1.7))
    const close = c * c * (3 - 2 * c)
    const { time, focusFrom, reveal } = timeline
    // The finished globe has no current chapter: everything shows at its settled brightness.
    const done = time >= STORY_END || !Number.isFinite(focusFrom)
    for (const material of materials) {
      const u = material.uniforms
      u.uDim.value = highlight.dim
      u.uPulse.value = reducedMotion() ? 0 : highlight.commit
      u.uClock.value = clock.elapsedTime
      // Faded out and skipped entirely while the Moon shot has the screen.
      u.uShow.value = distance.routes
      u.uResolution.value.set(size.width * viewport.dpr, size.height * viewport.dpr)
      u.uClose.value = close
      u.uWidth.value = WIDTH * (1 + 0.5 * close) * viewport.dpr
      u.uTime.value = time
      u.uReveal.value = reveal ? 1 : 0
      u.uTripStart.value = done ? 1e9 : focusFrom
      u.uHistory.value = done ? 1 : 0.7
    }
    if (mesh.current) mesh.current.visible = distance.routes > 0
    if (litMesh.current) litMesh.current.visible = distance.routes > 0 && highlight.members.length > 0
  })
  // Depth-tested against the globe body, so routes over the far side stay hidden.
  return (
    <>
      <mesh ref={mesh} geometry={geometry} material={materials[0]} renderOrder={3} frustumCulled={false} />
      <mesh ref={litMesh} geometry={lit} material={materials[1]} renderOrder={3.5} frustumCulled={false} />
    </>
  )
}
