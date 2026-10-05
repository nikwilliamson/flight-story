import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { SRGBColorSpace, TextureLoader, type Mesh, type MeshBasicMaterial, type Texture } from 'three'
import { creditFor, photoFor, photoUrl, type Photo } from '../data/photos'
import { Hit, pointer } from './kit'
import { Label } from './Label'
import { space, type, ui } from './tokens'

/** Photo box: 16:9, cropped to cover. */
export const PHOTO_ASPECT = 9 / 16
export const creditHeight = (s: number) => type.monoData.size * type.monoData.line * s + space.s * s

/**
 * An airframe's photo across the top of its card, with the photographer and licence under it (linked to the Commons
 * page). Fades in once loaded; reports whether there is one, so the card can close up the space when there isn't.
 */
export function PlanePhoto({ tail, x, y, width, s, onPhoto }: { tail: string | null; x: number; y: number; width: number; s: number; onPhoto: (has: boolean) => void }) {
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [texture, setTexture] = useState<Texture | null>(null)
  const mesh = useRef<Mesh>(null)
  const shown = useRef(0)
  const height = width * PHOTO_ASPECT

  useEffect(() => {
    let live = true
    photoFor(tail).then((p) => {
      if (!live) return
      setPhoto(p)
      onPhoto(!!p)
      if (p)
        new TextureLoader().load(photoUrl(p), (t) => {
          t.colorSpace = SRGBColorSpace
          if (live) setTexture(t)
          else t.dispose()
        })
    })
    return () => {
      live = false
    }
    // onPhoto is stable per card
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tail])
  useEffect(() => () => texture?.dispose(), [texture])

  // Cover: crop the photo's long side to the box.
  useMemo(() => {
    if (!texture || !photo) return
    const box = width / height
    const image = photo.width / photo.height
    const [sx, sy] = image > box ? [box / image, 1] : [1, image / box]
    texture.repeat.set(sx, sy)
    texture.offset.set((1 - sx) / 2, (1 - sy) / 2)
  }, [texture, photo, width, height])

  useFrame((_, delta) => {
    if (!mesh.current || !texture) return
    shown.current = Math.min(1, shown.current + delta * 2.5)
    ;(mesh.current.material as MeshBasicMaterial).opacity = shown.current
  })

  if (!photo) return null
  return (
    <group>
      {texture && (
        <mesh ref={mesh} position={[x + width / 2, -(y + height / 2), 0.2]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={texture} color="#d8dde6" transparent opacity={0} toneMapped={false} depthTest={false} depthWrite={false} />
        </mesh>
      )}
      <Label x={x} y={y + height + space.xs * s} role="monoData" s={s} color={ui.inkDim} width={width} nowrap>
        {creditFor(photo)}
      </Label>
      <Hit
        x={x}
        y={y + height + 4 * s}
        width={width}
        height={creditHeight(s)}
        onPointerOver={() => pointer(true)}
        onPointerOut={() => pointer(false)}
        onClick={(e) => {
          e.stopPropagation()
          window.open(photo.source, '_blank', 'noopener')
        }}
      />
    </group>
  )
}
