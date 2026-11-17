import { ALLWISE_MAP_MJD, DR1_MAP_MJD } from '../../shared/config/epoch'

/** Background sky surveys for The Eyes and the cube-slice maths (no Aladin import: testable in Node). */

export type SurveyKey = 'spherex' | 'wise' | 'twomass' | 'dss2'

export interface SurveyInfo {
  key?: SurveyKey
  id: string
  label: string
  credit: string
  url: string
  /** HiPS cube with one frame per wavelength. */
  cube: boolean
  /** Representative sky epoch in MJD when uniform (undefined for multi-decade optical mosaics like DSS2). */
  epochMjd?: number
  epochLabel?: string
  emMin?: number
  emMax?: number
  cubeDepth?: number
  /** True when metadata and service URL were loaded from sky_archive.hips_layers. */
  fromArchive?: boolean
}

/**
 * SPHEREx DR1 all-sky data cube (IRSA, released 2026-11-01): 102 frames from 0.75 to 5.0 µm, frame
 * index = 17 × (band − 1) + (channel − 1). Frames 50 and 51 (the dichroic channels) are blank.
 */
export const SPHEREX_SURVEY: SurveyInfo = {
  key: 'spherex',
  id: 'ivo://IPAC/P/SPHEREx/DR1/cube',
  label: 'SPHEREx DR1 all-sky cube',
  credit: 'NASA/SPHEREx, HiPS by Caltech/IPAC IRSA',
  url: 'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube',
  cube: true,
  epochMjd: DR1_MAP_MJD,
  epochLabel: 'Nov 2025 (DR1, MJD 60982)',
  emMin: 7.43e-7,
  emMax: 5.009e-6,
  cubeDepth: 102,
}

/** Public infrared WISE/AllWISE HiPS mirrors (IRSA / ESAC / CDS). */
export const WISE_MIRRORS = [
  'https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/RGB-W4-W2-W1',
  'https://skies.esac.esa.int/AllWISEColor',
  'https://alasky.cds.unistra.fr/unWISE/color-W2-W1W2-W1',
  'https://alasky.cds.unistra.fr/AllWISE/RGB-W4-W2-W1',
  'https://alaskybis.cds.unistra.fr/AllWISE/RGB-W4-W2-W1',
]

export const WISE_SURVEY: SurveyInfo = {
  key: 'wise',
  id: 'ivo://CDS/P/allWISE/color',
  label: 'WISE / AllWISE infrared color',
  credit: 'NASA/IPAC WISE, HiPS by CDS / IRSA',
  url: WISE_MIRRORS[0],
  cube: false,
  epochMjd: ALLWISE_MAP_MJD,
  epochLabel: '2010 (AllWISE, MJD 55396)',
}

/** Public 2MASS near-infrared (J/H/Ks) HiPS mirrors (IRSA / ESAC / CDS). */
export const TWOMASS_MIRRORS = [
  'https://irsa.ipac.caltech.edu/data/hips/CDS/2MASS/Color',
  'https://skies.esac.esa.int/2MASSColor',
  'https://alasky.cds.unistra.fr/2MASS/Color',
  'https://alaskybis.cds.unistra.fr/2MASS/Color',
]

export const TWOMASS_SURVEY: SurveyInfo = {
  key: 'twomass',
  id: 'ivo://CDS/P/2MASS/color',
  label: '2MASS near-infrared color atlas',
  credit: '2MASS / IPAC-Caltech / UMass, HiPS by IRSA / CDS',
  url: TWOMASS_MIRRORS[0],
  cube: false,
  epochMjd: 51544,
  epochLabel: '1997–2001 (2MASS, J2000)',
}

/** Official HiPS mirrors of CDS/P/DSS2/color: fallback when the primary survey cannot be reached. */
export const SURVEY_MIRRORS = [
  'https://irsa.ipac.caltech.edu/data/hips/CDS/DSS2/color',
  'https://skies.esac.esa.int/DSSColor',
  'https://alasky.cds.unistra.fr/DSS/DSSColor',
  'https://alaskybis.cds.unistra.fr/DSS/DSSColor',
]

export const DSS_SURVEY: SurveyInfo = {
  key: 'dss2',
  id: 'CDS/P/DSS2/color',
  label: 'DSS2 color (1950s–1990s optical fallback)',
  credit: 'Digitized Sky Survey, HiPS by CDS',
  url: SURVEY_MIRRORS[0],
  cube: false,
  epochLabel: '1950s–1990s optical plates (mixed epochs)',
}

/** Default credit before the map has loaded. */
export const SURVEY = SPHEREX_SURVEY

export interface HipsLayerInput {
  layer_id?: string | null
  title?: string | null
  service_url?: string | null
  spectral_metadata?: Record<string, unknown> | null
}

/** Build a SPHEREx SurveyInfo from a `sky_archive.hips_layers` row, keeping safe defaults. */
export function spherexSurveyFromHipsLayer(layer: HipsLayerInput | null | undefined, fallback: SurveyInfo = SPHEREX_SURVEY): SurveyInfo {
  if (!layer || typeof layer.service_url !== 'string' || !/^https?:\/\//i.test(layer.service_url.trim())) {
    return fallback
  }
  const meta = (layer.spectral_metadata && typeof layer.spectral_metadata === 'object' ? layer.spectral_metadata : {}) as Record<string, unknown>
  const emMin = typeof meta.em_min_m === 'number' && Number.isFinite(meta.em_min_m) ? meta.em_min_m : fallback.emMin
  const emMax = typeof meta.em_max_m === 'number' && Number.isFinite(meta.em_max_m) ? meta.em_max_m : fallback.emMax
  const cubeDepth = typeof meta.cube_frames === 'number' && Number.isFinite(meta.cube_frames) ? meta.cube_frames : fallback.cubeDepth
  const credit = typeof meta.credit === 'string' && meta.credit.trim() ? meta.credit.trim() : fallback.credit
  const cube = typeof meta.cube === 'boolean' ? meta.cube : fallback.cube
  return {
    ...fallback,
    id: layer.layer_id?.trim() || fallback.id,
    label: layer.title?.trim() || fallback.label,
    credit,
    url: layer.service_url.trim().replace(/\/+$/, ''),
    cube,
    emMin,
    emMax,
    cubeDepth,
    fromArchive: true,
  }
}

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
