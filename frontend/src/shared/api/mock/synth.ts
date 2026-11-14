/**
 * Synthetic SPHEREx-like cutouts for the Illustrative demo. These are generated pictures,
 * not observations. North is up, east is left; 6.15″ per pixel.
 */

export const PIX_ARCSEC = 6.15

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export interface Star {
  x: number
  y: number
  flux: number
}

export function makeField(seed: number, size: number, count: number): Star[] {
  const rnd = mulberry32(seed)
  const stars: Star[] = []
  for (let i = 0; i < count; i++) {
    // Power-law-ish brightness distribution: many faint, few bright.
    const flux = 0.02 + 0.9 * Math.pow(rnd(), 6)
    stars.push({ x: rnd() * size, y: rnd() * size, flux })
  }
  return stars
}

export function renderField(size: number, stars: Star[], noiseSeed: number, sigma = 0.85): Float32Array {
  const img = new Float32Array(size * size)
  const rnd = mulberry32(noiseSeed)
  const r = Math.ceil(sigma * 4)
  const inv = 1 / (2 * sigma * sigma)
  for (const s of stars) {
    const x0 = Math.floor(s.x)
    const y0 = Math.floor(s.y)
    for (let dy = -r; dy <= r; dy++) {
      const y = y0 + dy
      if (y < 0 || y >= size) continue
      for (let dx = -r; dx <= r; dx++) {
        const x = x0 + dx
        if (x < 0 || x >= size) continue
        const ddx = x + 0.5 - s.x
        const ddy = y + 0.5 - s.y
        img[y * size + x] += s.flux * Math.exp(-(ddx * ddx + ddy * ddy) * inv)
      }
    }
  }
  for (let i = 0; i < img.length; i++) img[i] += 0.012 + (rnd() - 0.5) * 0.012
  return img
}

/** Shared asinh stretch for all frames in a sequence (common norm). */
export function toGray(img: Float32Array, vmax: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(img.length)
  const k = 12
  const denom = Math.asinh(k)
  for (let i = 0; i < img.length; i++) {
    const v = Math.max(0, Math.min(1, img[i] / vmax))
    out[i] = Math.round((Math.asinh(k * v) / denom) * 255)
  }
  return out
}

/** Difference: zero maps to gray 128. */
export function toDiffGray(img: Float32Array, ref: Float32Array, scale: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(img.length)
  for (let i = 0; i < img.length; i++) out[i] = Math.round(128 + ((img[i] - ref[i]) / scale) * 127)
  return out
}

export async function grayToBitmap(gray: Uint8ClampedArray, size: number): Promise<ImageBitmap> {
  const rgba = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < gray.length; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = gray[i]
    rgba[i * 4 + 3] = 255
  }
  return createImageBitmap(new ImageData(rgba, size, size))
}

export async function rgbaToBitmap(rgba: Uint8ClampedArray, size: number): Promise<ImageBitmap> {
  return createImageBitmap(new ImageData(new Uint8ClampedArray(rgba), size, size))
}
