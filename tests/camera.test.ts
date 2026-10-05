import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three'
import { airports } from '../src/data'
import { latLonToVec3 } from '../src/geo'
import { followPose, wrap } from '../src/scene/camera/StoryCamera'
import { SHOTS } from '../src/story/shots'
import { timeline } from '../src/story/timeline'

const cam = new PerspectiveCamera(40, 1440 / 900)
const OSAKA = { ...SHOTS.osaka, follow: [392, 601] as const }
const kix = airports.findIndex((a) => a.code === 'KIX')
const poseAt = (t: number) => {
  timeline.time = t
  return followPose(OSAKA, cam, 1440, 900, null)
}

describe('camera follow (big chapters)', () => {
  it('starts and ends on the authored shot', () => {
    for (const t of [392, 603]) {
      const pose = poseAt(t)
      expect(Math.abs(wrap(pose.lon - OSAKA.lon))).toBeLessThan(1.5)
      expect(Math.abs(pose.lat - OSAKA.lat)).toBeLessThan(1.5)
      expect(pose.zoom).toBeCloseTo(OSAKA.zoom, 2)
    }
  })

  it('leans toward Osaka mid-chapter, within reach of the authored shot', () => {
    for (let t = 392; t < 500; t++) poseAt(t)
    const pose = poseAt(500)
    const toKix = (lon: number) => Math.abs(wrap(airports[kix].lon - lon))
    expect(toKix(pose.lon)).toBeLessThan(toKix(OSAKA.lon))
    const reach = latLonToVec3(pose.lat, pose.lon).angleTo(latLonToVec3(OSAKA.lat, OSAKA.lon))
    expect((reach * 180) / Math.PI).toBeLessThanOrEqual(35.01)
    expect(pose.zoom).toBeGreaterThanOrEqual(OSAKA.zoom)
    expect(pose.zoom).toBeLessThanOrEqual(OSAKA.zoom * 1.6 + 1e-9)
  })
})
