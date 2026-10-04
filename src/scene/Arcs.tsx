import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Mesh, ShaderMaterial, Vector2, Vector3 } from 'three'
import { airports, legs } from '../data'
import { angleBetween, arcPoints, latLonToVec3 } from '../geo'
import { palette } from '../theme'
import { useTerrain, type TerrainRadius } from './terrain'
import { FLIGHT, legStart, tripAt, trips, STORY_END } from '../story/schedule'
import { playhead } from '../story/playhead'
import { distance } from '../story/distance'
import { DIM, highlight, stepHighlight } from './highlight'

/** Matches aKind in the shader. */
const enum Kind {
  Domestic = 0,
  International = 1,
  /** Unknown destination: a trail from the known airport that dissolves before it arrives anywhere. */
  UnknownOut = 2,
  Ground = 3,
  /** Unknown origin: a trail that condenses out of nothing on its way into the known airport. */
  UnknownIn = 4,
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
      arcs.push({ a: airportVec[leg.from], b: airportVec[leg.to], start: legStart[i], kind: leg.intl ? Kind.International : Kind.Domestic, leg: i })
    }
    const prev = legs[i - 1]
    if (leg.ground && prev && prev.to >= 0 && leg.from >= 0 && prev.to !== leg.from) {
      arcs.push({ a: airportVec[prev.to], b: airportVec[leg.from], start: legStart[i] - 0.04, kind: Kind.Ground, leg: i })
    }
  })
  return arcs
}

/** One merged ribbon mesh for every arc: 2 vertices per sample, expanded to screen-space width in the shader. */
function buildGeometry(arcs: ArcSpec[]): BufferGeometry {
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
  let v = 0
  for (const arc of arcs) {
    const omega = angleBetween(arc.a, arc.b)
    // Short hops get a low, proportional arch so they don't spike up when the story camera flies in close.
    const lift = arc.kind === Kind.Ground ? Math.min(0.004, omega * 0.2) : Math.min(0.03, omega * 0.35) + 0.2 * (omega / Math.PI)
    const pts = arcPoints(arc.a, arc.b, SAMPLES, lift)
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
  }
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
  g.setIndex(index)
  return g
}

const vertexShader = /* glsl */ `
  uniform vec2 uResolution;
  uniform float uWidth;
  uniform sampler2D uHighlight;
  uniform float uHighlightWidth;
  attribute vec3 aPrev;
  attribute vec3 aNext;
  attribute float aSide;
  attribute float aT;
  attribute float aStart;
  attribute float aKind;
  attribute float aSpan;
  attribute float aLeg;
  varying float vHighlight;
  varying float vT;
  varying float vSpan;
  varying float vStart;
  varying float vKind;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 tangent = normalize((modelViewMatrix * vec4(aNext - aPrev, 0.0)).xyz + 1e-6);
    vec3 side = normalize(cross(tangent, normalize(-mv.xyz)));
    // World units per screen pixel at this depth, so the ribbon keeps a constant pixel width.
    float pixel = 2.0 * -mv.z / (projectionMatrix[1][1] * uResolution.y);
    ivec2 texel = ivec2(int(mod(aLeg, uHighlightWidth)), int(aLeg / uHighlightWidth));
    vHighlight = texelFetch(uHighlight, texel, 0).r;
    // Lit legs thicken a little so they read through the dimmed field.
    float width = uWidth * (aKind > 2.5 && aKind < 3.5 ? 0.8 : 1.0) * (1.0 + 0.6 * vHighlight);
    mv.xyz += side * aSide * width * 0.5 * pixel;
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
  uniform vec3 uDomestic;
  uniform vec3 uInternational;
  uniform vec3 uGround;
  varying float vT;
  varying float vStart;
  varying float vKind;
  varying float vSpan;
  varying float vHighlight;
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
    ghost *= vStart >= uTripStart - 0.001 ? 2.4 : uHistory;
    float pattern = 1.0;
    if (vKind > 2.5 && vKind < 3.5) { color = uGround; ghost *= 0.5; pattern = step(0.5, fract(vT * 30.0)); }   // by land
    // Unknown airport: solid, and gone well before the unknown end, so the trail just trails off.
    if (vKind > 1.5 && vKind < 2.5) pattern *= 1.0 - smoothstep(0.1, 0.7, vT);
    if (vKind > 3.5) pattern *= smoothstep(0.3, 0.9, vT);

    // Brightest at the apex and softer at the airports, like the light trails in the reference.
    // Routes dissolve over the last ~250 km into each airport, so hubs glow from the airport
    // sprite rather than from hundreds of overlapping lines. Measured in radians, so long and
    // short routes clear the same radius.
    float endFade = smoothstep(0.006, 0.04, min(vT, 1.0 - vT) * vSpan);
    float apex = (0.55 + 0.45 * sin(3.14159 * vT)) * endFade;
    // The line is laid down behind the plane as it flies, already at its settled look, so an arc draws itself
    // from A to B and simply stays; the comet head is the only thing that comes and goes.
    float a = max(head * 2.4, ghost * apex * flown) * pattern;
    // Highlight: lit legs fade to white at full strength, everything else dims (both eased on the CPU).
    float lit = max(a, 0.85 * apex * flown * pattern);
    a = mix(a * (1.0 - ${DIM.toFixed(2)} * uDim), lit, vHighlight);
    color = mix(color, vec3(1.0), vHighlight);
    gl_FragColor = vec4(color * a, a) * uShow;
  }
`

function makeMaterial() {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uShow: { value: 1 },
      uResolution: { value: new Vector2() },
      uWidth: { value: 1.1 },
      uTime: { value: 0 },
      uFlight: { value: FLIGHT },
      uTripStart: { value: 1e9 },
      uHistory: { value: 1 },
      uGhost: { value: 0.26 },
      uDim: { value: 0 },
      uHighlight: { value: highlight.texture },
      uHighlightWidth: { value: highlight.width },
      uDomestic: { value: palette.domestic },
      uInternational: { value: palette.international },
      uGround: { value: palette.ground },
    },
  })
}

export function Arcs() {
  const terrain = useTerrain()
  const geometry = useMemo(() => buildGeometry(collectArcs(terrain)), [terrain])
  const material = useMemo(makeMaterial, [])
  const { size, viewport } = useThree()
  const mesh = useRef<Mesh>(null)
  useFrame((_, delta) => {
    stepHighlight(Math.min(delta, 0.1))
    material.uniforms.uDim.value = highlight.dim
    // Faded out and skipped entirely while the Moon shot has the screen.
    material.uniforms.uShow.value = distance.routes
    if (mesh.current) mesh.current.visible = distance.routes > 0
    material.uniforms.uResolution.value.set(size.width * viewport.dpr, size.height * viewport.dpr)
    material.uniforms.uWidth.value = 1.1 * viewport.dpr
    const { time } = playhead.state
    material.uniforms.uTime.value = time
    // The finished globe has no current trip: everything shows at its settled brightness.
    const done = time >= STORY_END
    const trip = tripAt(time)
    material.uniforms.uTripStart.value = done || trip < 0 ? 1e9 : legStart[trips[trip].first]
    material.uniforms.uHistory.value = done ? 1 : 0.7
  })
  // Depth-tested against the globe body, so routes over the far side stay hidden.
  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={3} frustumCulled={false} />
}
