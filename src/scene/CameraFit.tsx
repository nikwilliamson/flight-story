import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'

/** Globe radius plus the bright atmosphere rim, so the whole glowing disc fits. */
const FIT_RADIUS = 1.1

/**
 * Pulls the camera back so the globe fits the shorter side of the viewport: the narrower of the vertical and
 * horizontal half-angles of view, against the sphere's silhouette (radius over sine, not tangent, since the
 * edge the eye sees is where the view ray grazes the sphere). Re-fits whenever the viewport changes shape.
 */
export function CameraFit() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const aspect = useThree((s) => s.size.width / s.size.height)
  useEffect(() => {
    const tanV = Math.tan((camera.fov * Math.PI) / 360)
    const halfAngle = Math.atan(Math.min(tanV, tanV * aspect))
    // Debug: #dist=<radii> places the camera at that distance (close-up screenshots).
    const dist = Number(new URLSearchParams(location.hash.slice(1)).get('dist'))
    camera.position.setLength(dist || FIT_RADIUS / Math.sin(halfAngle))
  }, [camera, aspect])
  return null
}

/** Closest the camera may come: about a third of a radius above the surface. */
export const NEAR_LIMIT = 1.45
