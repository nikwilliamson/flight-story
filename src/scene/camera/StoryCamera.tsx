import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'
import { latLonToVec3 } from '../../geo'
import { useStory, type Shot } from '../../state/store'

/** Damping rate from camera-spec.md: lon, lat and log-zoom each close this share of the gap per second. */
const RATE = 2.6
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

/** Shortest signed difference between two longitudes, so the camera always goes the short way round. */
export const wrap = (d: number) => ((((d + 540) % 360) + 360) % 360) - 180

/** Where the camera is right now (it lags the shot). Read by anything that waits for the camera to arrive. */
export const camera = { lon: -40, lat: 28, zoom: 1 }

/** The globe's camera, for screen-space layers (their own scenes have their own cameras) to project with. */
export const view: { camera: PerspectiveCamera | null } = { camera: null }

/** True once the camera is visually at the shot: within 2° and 6% zoom (camera-spec.md). */
export const settledOn = (shot: Shot) =>
  Math.abs(wrap(shot.lon - camera.lon)) < 2 && Math.abs(shot.lat - camera.lat) < 2 && Math.abs(Math.log(camera.zoom / shot.zoom)) < 0.06

const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

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
  const state = useRef({ target: { ...useStory.getState().shot }, shot: useStory.getState().shot, userTookOver: false }).current
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
      Object.assign(target, next)
      state.userTookOver = false
    } else if (state.shot.spin && !state.userTookOver) {
      target.lon += (dt * SPIN_DEG_PER_S) / Math.max(1, camera.zoom)
    }

    const s = reduceMotion() ? 1 : 1 - Math.exp(-dt * RATE)
    camera.lon += wrap(target.lon - camera.lon) * s
    camera.lat += (target.lat - camera.lat) * s
    camera.zoom = Math.exp(Math.log(camera.zoom) + (Math.log(target.zoom) - Math.log(camera.zoom)) * s)

    frame(cam, size.width, size.height, useStory.getState().stage)
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
function frame(cam: PerspectiveCamera, width: number, height: number, stage: { x: number; y: number; width: number; height: number } | null) {
  const s = stage ?? { x: 0, y: 0, width, height }
  const distance = distanceForZoom(camera.zoom, cam.fov, height, s)
  latLonToVec3(camera.lat, camera.lon, distance, cam.position)
  // Nothing sits higher than the tallest arc, so the near plane can ride just under it: close-ups (the jump, at
  // zoom 16) keep depth precision without a logarithmic depth buffer.
  cam.near = Math.max(0.002, (distance - 1 - ARC_CEILING) * 0.8)
  cam.up.set(0, 1, 0)
  cam.lookAt(0, 0, 0)
  const offsetX = width / 2 - (s.x + s.width / 2)
  const offsetY = height / 2 - (s.y + s.height / 2)
  // Both of these update the projection matrix, which the near plane change also needs.
  if (offsetX || offsetY) cam.setViewOffset(width, height, offsetX, offsetY, width, height)
  else cam.clearViewOffset()
}
