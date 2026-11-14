/**
 * Pure image-viewport math for the observation canvas. Image space: pixel (0,0) top-left,
 * integer pixel centres at +0.5. Screen space: CSS pixels inside the canvas.
 */

export interface Viewport {
  /** Screen pixels per image pixel. */
  scale: number
  /** Screen position of image coordinate (0,0). */
  offsetX: number
  offsetY: number
}

export const MIN_SCALE = 1
export const MAX_SCALE = 48

export function fitViewport(imgW: number, imgH: number, boxW: number, boxH: number, integer = true): Viewport {
  const raw = Math.min(boxW / imgW, boxH / imgH)
  const scale = integer && raw >= 1 ? Math.floor(raw) : raw
  return { scale, offsetX: (boxW - imgW * scale) / 2, offsetY: (boxH - imgH * scale) / 2 }
}

export function imageToScreen(v: Viewport, x: number, y: number): { x: number; y: number } {
  return { x: v.offsetX + x * v.scale, y: v.offsetY + y * v.scale }
}

export function screenToImage(v: Viewport, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - v.offsetX) / v.scale, y: (sy - v.offsetY) / v.scale }
}

/** Marker position for a top-left, integer-centred pixel coordinate (API predicted_px). */
export function pixelCentreToScreen(v: Viewport, px: [number, number]): { x: number; y: number } {
  return imageToScreen(v, px[0] + 0.5, px[1] + 0.5)
}

/** Zoom keeping the image point under (sx, sy) fixed. */
export function zoomAt(v: Viewport, factor: number, sx: number, sy: number): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
  const k = scale / v.scale
  return { scale, offsetX: sx - (sx - v.offsetX) * k, offsetY: sy - (sy - v.offsetY) * k }
}

export function pan(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, offsetX: v.offsetX + dx, offsetY: v.offsetY + dy }
}

/** Visible field of view in arcminutes for the current scale. */
export function visibleFovArcmin(v: Viewport, boxW: number, pixArcsec: number): number {
  return ((boxW / v.scale) * pixArcsec) / 60
}

/** Scale that shows `fovArcmin` across `boxW`. */
export function scaleForFov(fovArcmin: number, boxW: number, pixArcsec: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, boxW / ((fovArcmin * 60) / pixArcsec)))
}

/** Centre the given image point in the box at a given scale. */
export function centreOn(x: number, y: number, scale: number, boxW: number, boxH: number): Viewport {
  return { scale, offsetX: boxW / 2 - x * scale, offsetY: boxH / 2 - y * scale }
}
