import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type PerspectiveCamera } from 'three'
import { latLonToVec3 } from '../../geo'
import { useStory } from '../../state/store'
import { CHAPTERS } from '../../story/chapters'
import { distance, LAP_FRAME, MOON_DISTANCE, MOON_POSITION, ORIGIN } from '../../story/distance'
import { scroll } from '../../story/scrollState'
import { RETURN_PROGRESS } from '../DistanceTracks'
import { PACING } from '../../story/pacing'
import { distanceForZoom } from './StoryCamera'

/** Radians a second the camera keeps turning, so the shot is never static (globe v45). */
const DRIFT_SPEED = 0.05
const WORLD_UP = new Vector3(0, 1, 0)
const ROLL_LIMIT = 0.6
/** Camera damping rate, per second (camera-spec.md). */
const DAMPING = 2.6
/** Seconds the globe's own routes take to fade out once the line starts lapping. */
const ROUTES_OUT = 3
/** Where the return ends: the globe's opening view (and SHOTS.laps / SHOTS.moon, where the story camera resumes). */
const HOME = latLonToVec3(30, -52, 1)
/** Framing in the story camera's zoom units: close on the coil, and home. */
const LAPS_ZOOM = 0.9
const HOME_ZOOM = 1
/** Farthest the line strays from either body's centre (the eight's loops), in Earth radii. */
const LOOP_REACH = 2.5

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const smooth = (x: number) => {
  const k = clamp01(x)
  return k * k * (3 - 2 * k)
}
const isScene = (scene: 'laps' | 'moon') => CHAPTERS[scroll.active]?.scene === scene

/**
 * The distance section's camera (globe v48 DistanceDemo, on the story's clocks). While the line laps the Earth it
 * looks down on the coil from over Orlando, turning slowly round the globe. In the Moon chapter it swings square-on to
 * the Earth–Moon line and pulls back on its own clock, never tied to the line, until the Earth and the Moon share the
 * stage at true scale, rolling slowly about the line so the yarn's depth shows. It heads home when the line leaves
 * the Moon for the last time and lands as the line ends.
 *
 * Runs after StoryCamera and blends over it, so going in and out of the section is one damped move, never a cut.
 */
export function DistanceCamera() {
  const rig = useMemo(() => {
    // Square-on to the Earth–Moon line, leaning a little toward Orlando's side.
    const x = MOON_POSITION.clone().normalize()
    const y = ORIGIN.clone().addScaledVector(x, -ORIGIN.dot(x)).normalize()
    const z = new Vector3().crossVectors(x, y)
    return {
      wideTarget: MOON_POSITION.clone().multiplyScalar(0.5),
      wideDir: z.clone().addScaledVector(y, 0.25).normalize(),
      // Above Orlando and toward the orbit's axis, so the coil reads as rings round the Earth.
      lapsDir: LAP_FRAME.up.clone().multiplyScalar(0.6).addScaledVector(LAP_FRAME.axis, 0.8).normalize(),
      moonAxis: x,
      target: new Vector3(),
      dir: new Vector3(),
      aim: new Vector3(),
      look: new Vector3(),
      logDist: 0,
      /** Seconds lapping (the turn round the globe), in the Moon chapter (swing and zoom), and in the section at all. */
      lapsTime: 0,
      moonTime: 0,
      sectionTime: 0,
      /** How much this camera has the shot, 0–1. */
      weight: 0,
      ready: false,
      storyAim: new Vector3(),
      storyDir: new Vector3(),
    }
  }, [])

  useFrame(({ camera, size }, delta) => {
    const dt = Math.min(delta, 0.1)
    const inLaps = isScene('laps')
    const inMoon = isScene('moon')
    const inSection = inLaps || inMoon
    // Each clock runs forward while its chapter is on and back down when the reader leaves, so scrolling back up
    // unwinds the camera the way it came.
    rig.lapsTime = inLaps ? rig.lapsTime + dt : rig.lapsTime
    rig.moonTime = Math.max(0, rig.moonTime + (inMoon ? dt : -dt))
    rig.sectionTime = Math.max(0, Math.min(ROUTES_OUT, rig.sectionTime + (inSection ? dt : -dt)))

    // The line heads home once it leaves the Moon for the last time, and the drawings fade as it lands.
    const back = smooth((distance.moon - RETURN_PROGRESS) / (1 - RETURN_PROGRESS))
    distance.fade = 1 - smooth((back - 0.7) / 0.3)
    // The globe's routes fade out as the line starts lapping (and are skipped once gone), then all fade back in
    // together as the return lands on the globe.
    distance.routes = back > 0 ? smooth((back - 0.6) / 0.4) : 1 - smooth(rig.sectionTime / ROUTES_OUT)

    const follow = 1 - Math.exp(-DAMPING * dt)
    rig.weight += ((inSection ? 1 : 0) - rig.weight) * follow
    if (rig.weight < 0.001) {
      rig.ready = false
      return
    }

    const cam = camera as PerspectiveCamera
    const stage = useStory.getState().stage ?? { x: 0, y: 0, width: size.width, height: size.height }
    const near = distanceForZoom(LAPS_ZOOM, cam.fov, size.height, stage)
    const home = distanceForZoom(HOME_ZOOM, cam.fov, size.height, stage)
    // The wide shot: far enough back that the Earth–Moon line, with a margin, fits the stage's narrower side.
    const tanHalf = (Math.tan((cam.fov * Math.PI) / 360) * Math.min(stage.width, stage.height)) / size.height
    const far = (MOON_DISTANCE * 0.5 * 1.35) / tanHalf

    rig.dir.copy(rig.lapsDir).applyAxisAngle(WORLD_UP, -rig.lapsTime * DRIFT_SPEED)
    rig.dir.lerp(rig.wideDir, smooth(rig.moonTime / PACING.moonSwing)).normalize()
    // The roll eases toward ROLL_LIMIT so the eight never turns edge-on.
    const roll = Math.max(0, rig.moonTime - PACING.moonSwing) * DRIFT_SPEED
    rig.dir.applyAxisAngle(rig.moonAxis, ROLL_LIMIT * (1 - Math.exp(-roll / ROLL_LIMIT)))
    // Distance moves in log space so the zoom feels even, and the aim slides only as fast as the view widens, so the
    // Earth never leaves the frame.
    let dist = near * Math.pow(far / near, easeOut(rig.moonTime / PACING.moonZoom))
    rig.target.copy(rig.wideTarget).multiplyScalar((dist - near) / (far - near))
    if (back > 0) {
      const wide = dist
      dist = wide * Math.pow(home / wide, back)
      rig.target.multiplyScalar((dist - home) / (wide - home))
      rig.dir.lerp(HOME, back).normalize()
    }

    const s = rig.ready ? follow : 1
    rig.ready = true
    rig.aim.lerp(rig.target, s)
    rig.look.lerp(rig.dir, s).normalize()
    rig.logDist += (Math.log(dist) - rig.logDist) * s

    // Blend from wherever the story camera put the eye: aim, direction and log distance, like the rig itself.
    const w = rig.weight
    rig.storyAim.set(0, 0, 0)
    rig.storyDir.copy(cam.position).normalize()
    const storyLog = Math.log(cam.position.length())
    const aim = rig.storyAim.lerp(rig.aim, w)
    const dir = rig.storyDir.lerp(rig.look, w).normalize()
    const d = Math.exp(storyLog + (rig.logDist - storyLog) * w)
    cam.position.copy(aim).addScaledVector(dir, d)
    cam.up.set(0, 1, 0)
    cam.lookAt(aim)
    // Wide shots reach the Moon: keep depth precision by riding the near plane just short of whichever body (and the
    // line's loops round it) is closer.
    const nearest = Math.min(cam.position.length(), cam.position.distanceTo(MOON_POSITION))
    cam.near = Math.max(0.002, Math.min(cam.near, (nearest - LOOP_REACH) * 0.8))
    cam.far = Math.max(1000, d * 4)
    cam.updateProjectionMatrix()
  })
  return null
}
