/**
 * Airframe photos from Wikimedia Commons (public/planes, built by the plane-photos workflow), keyed by the tail
 * exactly as logged. The manifest is fetched once, on first use, so it never weighs on the first load.
 */
export interface Photo {
  file: string
  width: number
  height: number
  title: string
  /** The Commons file page: the credit links here. */
  source: string
  author: string
  license: string
  licenseUrl: string
  registration: string
}

let manifest: Promise<Record<string, Photo>> | null = null

export function photoFor(tail: string | null): Promise<Photo | null> {
  if (!tail) return Promise.resolve(null)
  manifest ??= fetch(`${import.meta.env.BASE_URL}planes/manifest.json`)
    .then((r) => (r.ok ? r.json() : { photos: {} }))
    .then((m: { photos: Record<string, Photo> }) => m.photos)
    .catch(() => ({}))
  return manifest.then((photos) => photos[tail] ?? null)
}

export const photoUrl = (photo: Photo) => `${import.meta.env.BASE_URL}planes/${photo.file}`

/** "Photo: André Gerwing · CC BY-SA 4.0", as CC BY and BY-SA ask. */
export const creditFor = (photo: Photo) => `Photo: ${photo.author} · ${photo.license}`
