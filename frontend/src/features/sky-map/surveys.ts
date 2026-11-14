/** Background sky surveys for The Eyes and the cube-slice maths (no Aladin import: testable in Node). */

export interface SurveyInfo {
  id: string
  label: string
  credit: string
  url: string
  /** HiPS cube with one frame per wavelength. */
  cube: boolean
}

/**
 * SPHEREx DR1 all-sky data cube (IRSA, released 2026-11-01): 102 frames from 0.75 to 5.0 µm, frame
 * index = 17 × (band − 1) + (channel − 1). Frames 50 and 51 (the dichroic channels) are blank.
 */
export const SPHEREX_SURVEY: SurveyInfo = {
  id: 'ivo://IPAC/P/SPHEREx/DR1/cube',
  label: 'SPHEREx DR1 all-sky cube',
  credit: 'NASA/SPHEREx, HiPS by Caltech/IPAC IRSA',
  url: 'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube',
  cube: true,
}

export const DSS_SURVEY = { id: 'CDS/P/DSS2/color', label: 'DSS2 color', credit: 'Digitized Sky Survey, HiPS by CDS', cube: false }

/** Default credit before the map has loaded. */
export const SURVEY = SPHEREX_SURVEY

/** Middle channel (9 of 17) of a SPHEREx detector, as a 0-based cube frame. */
export function sliceForDetector(detector: number): number {
  const band = Math.min(6, Math.max(1, Math.round(detector) || 6))
  return 17 * (band - 1) + 8
}

const SPEED_OF_LIGHT = 299_792_458

/**
 * Aladin Lite 3.8 turns a slice number into a frequency linearly in *wavelength*, but its WebGL core
 * turns that frequency back into a tile frame linearly in *frequency*, so setSliceNumber(n) loads the
 * wrong frame. Return the argument that makes the core load `frame` (measured: n = 8 loaded frame 64).
 */
export function aladinSliceArgument(frame: number, layer?: { emMin?: number; emMax?: number; cubeDepth?: number }): number {
  const emMin = layer?.emMin ?? 7.43e-7
  const emMax = layer?.emMax ?? 5.009e-6
  const depth = layer?.cubeDepth ?? 102
  const fMin = SPEED_OF_LIGHT / emMax
  const fMax = SPEED_OF_LIGHT / emMin
  const frequency = fMin + ((frame + 0.5) / depth) * (fMax - fMin)
  const wavelength = SPEED_OF_LIGHT / frequency
  return ((wavelength - emMin) / (emMax - emMin)) * depth
}
