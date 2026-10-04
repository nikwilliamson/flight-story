import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import { airports } from '../data'
import { latLonToVec3 } from '../geo'
import { view } from '../scene/camera/StoryCamera'
import { jump, jumpPhase } from '../story/jump'

/** How far above the drop zone the line starts, CSS px (wireframe: 90). */
const FALL_PX = 90
const DASH = 2
const GAP = 5
const DASHES = Math.ceil(FALL_PX / (DASH + GAP))
const RING = 14

const zone = airports.findIndex((a) => a.code === 'X21')
const zoneAt = zone >= 0 ? latLonToVec3(airports[zone].lat, airports[zone].lon, 1.001) : null

/**
 * After the door flash, a dashed white line falls onto the drop zone and a ring marks where he landed (wireframe
 * drawDrop). Screen space: the camera looks straight down at Titusville, so a line drawn in the scene would point
 * at the viewer and vanish.
 */
export function JumpDrop() {
  const height = useThree((s) => s.size.height)
  const width = useThree((s) => s.size.width)
  const group = useRef<Group>(null)
  const dashes = useRef<Group>(null)
  const head = useRef<Group>(null)
  const ring = useRef<Group>(null)
  const p = useMemo(() => new Vector3(), [])

  useFrame(() => {
    const g = group.current
    if (!g) return
    const { drop } = jumpPhase(jump.progress)
    g.visible = drop > 0 && !!zoneAt && !!view.camera
    if (!g.visible) return
    p.copy(zoneAt!).project(view.camera!)
    const x = ((p.x + 1) / 2) * width
    const y = ((1 - p.y) / 2) * height
    const fallen = FALL_PX * drop
    g.position.set(x, -y, 0)
    dashes.current!.children.forEach((d, i) => (d.visible = i * (DASH + GAP) < fallen))
    head.current!.position.y = FALL_PX - fallen
    ring.current!.visible = drop > 0.95
  })

  return (
    <group ref={group} visible={false}>
      <group ref={dashes}>
        {Array.from({ length: DASHES }, (_, i) => (
          <mesh key={i} position={[0, FALL_PX - i * (DASH + GAP) - DASH / 2, 0]}>
            <planeGeometry args={[1.6, DASH]} />
            <meshBasicMaterial color="white" transparent />
          </mesh>
        ))}
      </group>
      <group ref={head}>
        <mesh>
          <circleGeometry args={[3, 24]} />
          <meshBasicMaterial color="white" transparent />
        </mesh>
      </group>
      <group ref={ring}>
        <mesh>
          <ringGeometry args={[RING - 0.8, RING + 0.8, 64]} />
          <meshBasicMaterial color="white" transparent />
        </mesh>
      </group>
    </group>
  )
}
