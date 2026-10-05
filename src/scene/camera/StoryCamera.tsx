import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Vector3 } from 'three'
import { airports, legs } from '../../data'
import { latLonToVec3 } from '../../geo'
import { reducedMotion } from '../../motion'
import { PACING } from '../../story/pacing'
import { STORY_END, timeline } from '../../story/timeline'
import { useStory, type Shot } from '../../state/store'

const SPIN_DEG_PER_S = 4
const MIN_ZOOM = 0.6
const MAX_ZOOM = 20
const MAX_LAT = 80
/** zoom = 1 frames the globe's radius at this share of the stage's shorter side. */
const RADIUS_SHARE = 0.42
/** Closest the eye may come to the unit sphere's surface, so terrain never clips the near plane. */
const MIN_ALTITUDE = 0.02
/** Height of the highest arc above the unit sphere (Arcs lift: 0.03 + 0.2 for a half-world leg). */
const ARC_CEILING = 0.25

/** Distance where the horizon tilt starts, and how far (radians) the view pitches near the ground (globe v48). */
const TILT_FROM = 3.4
const TILT_NEAR = 1.45
const MAX_TILT = 0.85
/** Most the view turns into the direction of travel (v48 MAX_YAW); a due-east or due-west flight gets all of it. */
const MAX_YAW = 0.7
/** Fitted points stay within 1 / FIT_MARGIN of the stage's half-size (v48). */
const FIT_MARGIN = 1.2
/**
 * Following a big chapter: frame the busiest cluster among the last FOLLOW_LEGS legs drawn, re-aimed every FOLLOW_EVERY seconds, never further
 * than FOLLOW_REACH degrees from the authored shot nor closer in than FOLLOW_ZOOM times its zoom.
 */
const FOLLOW_LEGS = 32
const FOLLOW_EVERY = 0.6
const FOLLOW_REACH = 35
const FOLLOW_ZOOM = 1.6
/** Airports within this many degrees of each other count as one cluster. */
const FOLLOW_CLUSTER = 22
/** The camera stays on its cluster while it has at least this share of the busiest one's airports. */
const FOLLOW_KEEP = 0.75
/** Legs over which the follow eases in from the authored shot, and back out to it at the end. */
const FOLLOW_EASE = 12
/** The globe's slow idle turn (v48 OrbitControls autoRotateSpeed 0.18: about 1.1° a second), eased with zoom. */
const DRIFT_DEG_PER_S = 1.1

/** How far the view pitches toward the horizon at eye distance d: none far out, MAX_TILT close in. */
export function tiltAt(d: number) {
  const k = Math.min(1, Math.max(0, (TILT_FROM - d) / (TILT_FROM - TILT_NEAR)))
  return MAX_TILT * k * k * (3 - 2 * k)
}

/** Shortest signed difference between two longitudes, so the camera always goes the short way round. */
export const wrap = (d: number) => ((((d + 540) % 360) + 360) % 360) - 180

/** Where the camera is right now (it lags the shot). Read by anything that waits for the camera to arrive. */
export const camera = { lon: -40, lat: 28, zoom: 1, yaw: 0 }
/** Where the camera is headed: the current shot, with its zoom fitted to its legs. */
const goal = { shot: null as Shot | null, lon: 0, lat: 0, zoom: 1 }
/** Degrees of idle turn on top of camera.lon; folded into it whenever the shot changes, so nothing jumps. */
const drift = { lon: 0 }

/** The globe's camera, for screen-space layers (their own scenes have their own cameras) to project with. */
export const view: { camera: PerspectiveCamera | null } = { camera: null }

/** True once the camera is visually at the shot: within 2° and 6% zoom (camera-spec.md), after any fitting. */
export const settledOn = (shot: Shot) => {
  const g = goal.shot === shot ? goal : shot
  return Math.abs(wrap(g.lon - camera.lon)) < 2 && Math.abs(g.lat - camera.lat) < 2 && Math.abs(Math.log(camera.zoom / g.zoom)) < 0.06
}


/**
 * The wireframe camera: three numbers damped toward the current shot, zoom in log space, longitude the short way.
 * A long move pulls back and pushes in by itself because all three damp together; nothing is keyframed.
 * Dragging and pinching move the target, not the camera, so they get the same easing.
 */
export function StoryCamera() {
  const cam = useThree((s) => s.camera) as PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  // Mutable across renders: a resize re-renders this component but must not reset the move in progress.
  const state = useRef({ target: { ...useStory.getState().shot }, shot: useStory.getState().shot, userTookOver: false, dragging: false, yaw: 0, yawGoal: 0, yawHeld: 0, followIn: 0 }).current
  const { target } = state
  useEffect(() => {
    view.camera = cam
  }, [cam])

  useEffect(() => {
    const el = gl.domElement
    const pointers = new Map<number, { x: number; y: number }>()
    let pinch = 0
    const degPerPx = () => 180 / (Math.PI * RADIUS_SHARE * Math.min(size.width, size.height) * camera.zoom)
    // During the story the page scrolls under the canvas; the globe only takes the pointer once it's released.
    const live = () => useStory.getState().interactive
    const down = (e: PointerEvent) => {
      if (!live()) return
      el.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      state.userTookOver = true
      state.dragging = true
    }
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      const next = { x: e.clientX, y: e.clientY }
      pointers.set(e.pointerId, next)
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch) target.zoom = clampZoom(target.zoom * (d / pinch))
        pinch = d
        return
      }
      target.lon -= (next.x - prev.x) * degPerPx()
      target.lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, target.lat + (next.y - prev.y) * degPerPx()))
    }
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      pinch = 0
      state.dragging = pointers.size > 0
    }
    const wheel = (e: WheelEvent) => {
      // A plain wheel always scrolls the story; a trackpad pinch (ctrl + wheel) zooms the released globe.
      if (!live() || !e.ctrlKey) return
      e.preventDefault()
      state.userTookOver = true
      target.zoom = clampZoom(target.zoom * Math.exp(-e.deltaY * 0.0015))
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl, size, state, target])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const next = useStory.getState().shot
    if (next !== state.shot) {
      // A new shot retargets and hands the camera back from any drag.
      state.shot = next
      state.userTookOver = false
      const yaw = next.fit?.length ? yawAlong(longest(next.fit), latLonToVec3(next.lat, next.lon)) : 0
      const zoom = next.fit?.length ? fitZoom(next, yaw, cam, size.width, size.height, useStory.getState().stage) : next.zoom
      // Debounced (Nik): a shot that barely differs from where the camera is already headed doesn't move it at all.
      const small = Math.abs(wrap(next.lon - target.lon)) < PACING.minMoveDeg && Math.abs(next.lat - target.lat) < PACING.minMoveDeg && Math.abs(Math.log(zoom / target.zoom)) < PACING.minZoom
      if (!small) {
        Object.assign(target, next, { zoom })
        camera.lon += drift.lon
        drift.lon = 0
        state.yaw = yaw
      }
      target.spin = next.spin
      state.followIn = FOLLOW_EVERY
      Object.assign(goal, { shot: next, lon: target.lon, lat: target.lat, zoom: target.zoom })
    } else if (next.follow && !state.userTookOver && (state.followIn -= dt) <= 0) {
      // Re-aimed on a beat, not every frame, and only past the same debounce as a new shot, so the camera glides
      // between framings instead of chasing every hop.
      state.followIn = FOLLOW_EVERY
      const pose = followPose(next, cam, size.width, size.height, useStory.getState().stage)
      const moved = Math.abs(wrap(pose.lon - target.lon)) >= PACING.minMoveDeg || Math.abs(pose.lat - target.lat) >= PACING.minMoveDeg || Math.abs(Math.log(pose.zoom / target.zoom)) >= PACING.minZoom
      if (moved) {
        Object.assign(target, pose)
        Object.assign(goal, pose)
      }
    } else if (state.shot.spin && !state.userTookOver) {
      target.lon += (dt * SPIN_DEG_PER_S) / Math.max(1, camera.zoom)
    }

    // Into the direction of travel (v48): the fitted legs' heading, or while a chapter plays, the leg in the air.
    const flying = !state.shot.fit?.length && Number.isFinite(timeline.focusFrom) && !timeline.reveal && timeline.time < STORY_END
    const wanted = state.userTookOver ? 0 : flying ? yawAlong(Math.min(legs.length - 1, Math.floor(timeline.time)), latLonToVec3(camera.lat, camera.lon)) : state.yaw
    // Debounced: the heading only changes once a new one is clearly different and has held for a beat, so a run of
    // short hops doesn't wobble the view.
    if (Math.abs(wanted - state.yawGoal) < PACING.minYaw) state.yawHeld = 0
    else if ((state.yawHeld += dt) > PACING.yawHold || !flying) [state.yawGoal, state.yawHeld] = [wanted, 0]
    const yawTarget = state.yawGoal
    camera.yaw += (yawTarget - camera.yaw) * (reducedMotion() ? 1 : 1 - Math.exp(-dt * PACING.yaw))

    const s = reducedMotion() ? 1 : 1 - Math.exp(-dt * PACING.camera)
    camera.lon += wrap(target.lon - camera.lon) * s
    camera.lat += (target.lat - camera.lat) * s
    camera.zoom = Math.exp(Math.log(camera.zoom) + (Math.log(target.zoom) - Math.log(camera.zoom)) * s)
    // The globe never sits dead still (v48): a slow turn that eases off as the camera closes in, so close-ups barely move.
    if (!state.shot.spin && !state.dragging && !reducedMotion()) drift.lon += (dt * DRIFT_DEG_PER_S) / Math.max(1, camera.zoom * camera.zoom)

    frame(cam, size.width, size.height, useStory.getState().stage, { lon: camera.lon + drift.lon, lat: camera.lat, zoom: camera.zoom, yaw: camera.yaw })
  })
  return null
}

/** Eye distance from the globe's centre at which it frames at `zoom` in the stage (see frame). */
export function distanceForZoom(zoom: number, fov: number, height: number, stage: { width: number; height: number }) {
  const radiusPx = RADIUS_SHARE * Math.min(stage.width, stage.height) * zoom
  // Silhouette half-angle α: its screen radius is (height / 2) · tan α / tan(fov / 2).
  const tanAlpha = (2 * radiusPx * Math.tan((fov * Math.PI) / 360)) / height
  return Math.max(1 + MIN_ALTITUDE, 1 / Math.sin(Math.atan(tanAlpha)))
}

const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))

/**
 * Places the camera so the globe's silhouette has radius RADIUS_SHARE × zoom × the stage's shorter side, centred
 * in the stage. The stage is applied with setViewOffset, so the damping model never knows about layout.
 */
const aim = new Vector3()
const north = new Vector3()
const side = new Vector3()
const forward = new Vector3()

interface Pose {
  lon: number
  lat: number
  zoom: number
  /** Radians the view turns from north-up; positive brings a westward heading up the screen. */
  yaw: number
}
type Frame = { x: number; y: number; width: number; height: number }

function frame(cam: PerspectiveCamera, width: number, height: number, stage: Frame | null, pose: Pose) {
  const s = stage ?? { x: 0, y: 0, width, height }
  const distance = distanceForZoom(pose.zoom, cam.fov, height, s)
  // Pitched toward the horizon as it closes in and turned by the yaw (v48 poseFor): the eye swings back from over the
  // aim point, keeping its height, and looks at the ground there, so close-ups read as flying over the Earth.
  const tilt = tiltAt(distance)
  latLonToVec3(pose.lat, pose.lon, 1, aim)
  north.set(0, 1, 0).addScaledVector(aim, -aim.y).normalize()
  side.crossVectors(aim, north)
  forward.copy(north).multiplyScalar(Math.cos(pose.yaw)).addScaledVector(side, Math.sin(pose.yaw))
  cam.position.copy(aim).multiplyScalar(Math.cos(tilt)).addScaledVector(forward, -Math.sin(tilt)).multiplyScalar(distance - 1).add(aim)
  // Nothing sits higher than the tallest arc, so the near plane can ride just under it: close-ups (the jump, at
  // zoom 16) keep depth precision without a logarithmic depth buffer.
  cam.near = Math.max(0.002, (distance - 1 - ARC_CEILING) * 0.8 * Math.cos(tilt))
  cam.up.copy(forward)
  cam.lookAt(aim)
  const offsetX = width / 2 - (s.x + s.width / 2)
  const offsetY = height / 2 - (s.y + s.height / 2)
  // Both of these update the projection matrix, which the near plane change also needs.
  if (offsetX || offsetY) cam.setViewOffset(width, height, offsetX, offsetY, width, height)
  else cam.clearViewOffset()
}

const ends = (i: number) => [legs[i].from, legs[i].to].filter((a) => a >= 0).map((a) => latLonToVec3(airports[a].lat, airports[a].lon))

/** The longest leg in a set: its heading reads as the set's direction of travel. */
function longest(set: readonly number[]) {
  let best = set[0]
  let span = -1
  for (const i of set) {
    const [a, b] = ends(i)
    const d = a && b ? a.angleTo(b) : 0
    if (d > span) [best, span] = [i, d]
  }
  return best
}

const heading = new Vector3()

/** The yaw that turns leg i's heading toward screen-up at centre n (v48 yawFor): the flight travels into the frame. */
function yawAlong(i: number, n: Vector3) {
  const [a, b] = ends(i)
  if (!a || !b || a.angleTo(b) < 0.005) return 0
  heading.copy(b).sub(a)
  heading.addScaledVector(n, -heading.dot(n))
  if (heading.lengthSq() < 1e-12) return 0
  north.set(0, 1, 0).addScaledVector(n, -n.y).normalize()
  side.crossVectors(n, north)
  return MAX_YAW * heading.normalize().dot(side)
}

const centre = new Vector3()
const anchor = new Vector3()
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))
const CLUSTER_COS = Math.cos((FOLLOW_CLUSTER * Math.PI) / 180)
/** The cluster the follow camera is on, kept until another is clearly busier (hysteresis), so it doesn't flip-flop. */
const held = new Vector3()
let holding = false

/** Mean of the points within FOLLOW_CLUSTER of c, written into c; returns how many there were. */
function gather(points: Vector3[], c: Vector3) {
  const near = points.filter((p) => p.dot(c) >= CLUSTER_COS)
  if (!near.length) return near
  c.set(0, 0, 0)
  for (const p of near) c.add(p)
  c.normalize()
  return near
}

/**
 * Where a following shot looks right now: the busiest cluster of airports among the legs just drawn (Osaka's run of
 * hops around Japan, not the midpoint of the Pacific crossings that bracket it), eased in from the authored shot as the
 * chapter starts and back out to it as it ends, so the whole chapter is in view once it's drawn.
 */
export function followPose(shot: Shot, cam: PerspectiveCamera, width: number, height: number, stage: Frame | null) {
  const [first, last] = shot.follow!
  const authored = { lon: shot.lon, lat: shot.lat, zoom: shot.zoom }
  const now = Math.min(last, Math.floor(timeline.time))
  const from = Math.max(first, now - FOLLOW_LEGS + 1)
  const points: Vector3[] = []
  for (let i = from; i <= now; i++) points.push(...ends(i))
  const weight = smooth((now - first + 1) / FOLLOW_EASE) * (1 - smooth((timeline.time - (last - FOLLOW_EASE)) / (FOLLOW_EASE + 1)))
  if (!points.length || weight <= 0) return (holding = false), authored

  // The densest cluster, seeded from each endpoint and taken as its mean; the one already followed stays while it's
  // nearly as busy.
  let best: Vector3[] = []
  for (const seed of points) {
    const near = gather(points, centre.copy(seed))
    if (near.length > best.length) {
      best = near
      anchor.copy(centre)
    }
  }
  if (holding) {
    const kept = gather(points, centre.copy(held))
    if (kept.length >= best.length * FOLLOW_KEEP) {
      best = kept
      anchor.copy(centre)
    }
  }
  held.copy(anchor)
  holding = true

  // Never further than FOLLOW_REACH from the authored shot, so the chapter's framing still reads as its own.
  const target = centre.copy(anchor)
  latLonToVec3(shot.lat, shot.lon, 1, anchor)
  const angle = anchor.angleTo(target)
  const reach = Math.min(angle, (FOLLOW_REACH * Math.PI) / 180) * weight
  if (angle > 1e-6) {
    side.copy(target).addScaledVector(anchor, -anchor.dot(target)).normalize()
    target.copy(anchor).multiplyScalar(Math.cos(reach)).addScaledVector(side, Math.sin(reach))
  }
  const lat = (Math.asin(Math.max(-1, Math.min(1, target.y))) * 180) / Math.PI
  const lon = lonOf(target)
  const fitted = fitZoom({ lon, lat, zoom: shot.zoom * FOLLOW_ZOOM }, 0, cam, width, height, stage, shot.zoom, best)
  const zoom = Math.exp(Math.log(shot.zoom) + (Math.log(Math.max(shot.zoom, fitted)) - Math.log(shot.zoom)) * weight)
  return { lon, lat, zoom }
}

/** The longitude of a point on the unit sphere, matching latLonToVec3. */
const lonOf = (v: Vector3) => (Math.atan2(v.x, v.z) * 180) / Math.PI

const probe = new PerspectiveCamera()
const point = new Vector3()
const toPoint = new Vector3()

/**
 * The closest zoom, up to the shot's own, at which both ends of every fitted leg land inside the stage once the
 * camera is tilted and turned as it will be, and face the camera. Bisection: fitting only gets easier further out.
 */
function fitZoom(shot: Shot, yaw: number, cam: PerspectiveCamera, width: number, height: number, stage: Frame | null, fallback = shot.zoom, points = shot.fit!.flatMap(ends)) {
  const s = stage ?? { x: 0, y: 0, width, height }
  probe.fov = cam.fov
  probe.aspect = cam.aspect
  const fits = (zoom: number) => {
    frame(probe, width, height, stage, { lon: shot.lon, lat: shot.lat, zoom, yaw })
    probe.updateMatrixWorld()
    return points.every((p) => {
      // Over the horizon: the ground there faces away from the eye.
      if (p.dot(toPoint.copy(probe.position).sub(p)) <= 0) return false
      point.copy(p).project(probe)
      const x = ((point.x + 1) / 2) * width
      const y = ((1 - point.y) / 2) * height
      const cx = s.x + s.width / 2
      const cy = s.y + s.height / 2
      return Math.abs(x - cx) * FIT_MARGIN <= s.width / 2 && Math.abs(y - cy) * FIT_MARGIN <= s.height / 2
    })
  }
  if (fits(shot.zoom)) return shot.zoom
  let lo = MIN_ZOOM
  let hi = shot.zoom
  // Spread round the globe, nothing fits: keep the authored framing rather than backing off for nothing.
  if (!fits(lo)) return fallback
  for (let k = 0; k < 18; k++) {
    const mid = Math.sqrt(lo * hi)
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return lo
}
