import { Vector3, type Camera } from 'three'

/** Key light fixed relative to the camera (upper left, slightly behind), so the lit edge never swings away. */
const SUN_VIEW = new Vector3(-0.75, 0.55, -0.35).normalize()

/** Writes the key light's world-space direction for this frame into `target`. */
export const sunDirection = (camera: Camera, target: Vector3) => target.copy(SUN_VIEW).transformDirection(camera.matrixWorld)
