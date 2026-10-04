import { Vector3 } from 'three'

const DEG = Math.PI / 180

/** Unit-sphere position; +Y is north, lon 0 faces +Z. */
export function latLonToVec3(lat: number, lon: number, radius = 1, target = new Vector3()): Vector3 {
  const phi = lat * DEG
  const lambda = lon * DEG
  return target.set(
    radius * Math.cos(phi) * Math.sin(lambda),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.cos(lambda),
  )
}

/** Angular distance in radians between two unit vectors. */
export const angleBetween = (a: Vector3, b: Vector3) => Math.acos(Math.min(1, Math.max(-1, a.dot(b))))

/**
 * Samples a great-circle arc lifted off the surface. Peak height grows with distance so
 * long-haul arcs read as long-haul.
 */
export function arcPoints(a: Vector3, b: Vector3, samples: number, lift: number): Vector3[] {
  const omega = angleBetween(a, b)
  const sinO = Math.sin(omega)
  const points: Vector3[] = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const p =
      sinO < 1e-6
        ? a.clone()
        : a.clone().multiplyScalar(Math.sin((1 - t) * omega) / sinO).add(b.clone().multiplyScalar(Math.sin(t * omega) / sinO))
    // Endpoint radii carry the terrain height; blend between them under the lift.
    const base = a.length() * (1 - t) + b.length() * t
    p.normalize().multiplyScalar(base + lift * Math.sin(Math.PI * t))
    points.push(p)
  }
  return points
}
