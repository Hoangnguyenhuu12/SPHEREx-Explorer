/**
 * Provisional types for API 0.1 (training contract), plus optional fields requested in
 * docs FE_API_CONTRACT_NEEDS.md. Replace with types generated from the agreed OpenAPI.
 */

export type DataMode = 'live' | 'fixture' | 'mock'

export interface HealthResponse {
  api_version: string
  status: string
  mode: string
  git_sha?: string | null
  irsa_reachable?: boolean | null
}

export interface ApiTarget {
  ra: number
  dec: number
  name: string | null
  target_key: string | null
}

export interface ResolveResponse {
  api_version: string
  query: string
  target_key: string | null
  name: string
  ra: number
  dec: number
  epoch: string
  pmra: number | null
  pmdec: number | null
  parallax_mas: number | null
  kind: string | null
  source: string
}

export interface Grid {
  width: number
  height: number
  pixscale_arcsec: number
  projection: string
  center_ra: number
  center_dec: number
}

export interface Norm {
  vmin: number
  vmax: number
  stretch: string
}

export interface Frame {
  id: string
  mjd: number
  iso: string
  wavelength_um: number | null
  bandwidth_um: number | null
  release: string | null
  survey: number | null
  bad_pixel_frac: number | null
  /** Top-left origin, integer pixel centres. */
  predicted_px: [number, number] | null
  png: string
  diff_png: string
  // Requested additions (optional until agreed)
  detector?: number
  t_min_mjd?: number
  t_max_mjd?: number
  n_exposures?: number
}

export type WarningCode =
  | 'SATURATION_POSSIBLE'
  | 'FEW_FRAMES'
  | 'TRUNCATED'
  | 'MIXED_WAVELENGTH'
  | 'TARGET_OUTSIDE_COVERAGE'
  | (string & {})

export interface FramesResponse {
  api_version: string
  target: ApiTarget
  detector: number
  grid: Grid
  norm: Norm
  reference_frame_id: string | null
  frames: Frame[]
  warnings: WarningCode[]
  // Requested additions
  mode?: DataMode
  attribution?: string
}

export interface FramesParams {
  ra: number
  dec: number
  detector: number
  size: number
  maxFrames: number
  targetKey?: string
}

export interface PhotometryPoint {
  frame_id: string
  mjd: number
  wavelength_um: number
  detector: number
  release: string | null
  flux_mjy: number | null
  err_mjy: number | null
  snr: number | null
  detected: boolean
  flagged: boolean
  flag_reasons?: string[]
}

export interface PhotometryResponse {
  api_version: string
  target: ApiTarget
  points: PhotometryPoint[]
  mode?: DataMode
}

export interface AstrometryPoint {
  frame_id: string
  mjd: number
  measured: { ra: number; dec: number; err_arcsec: number } | null
  predicted: { ra: number; dec: number } | null
  offset_arcsec: number | null
  measured_px: [number, number] | null
  predicted_px?: [number, number] | null
}

export interface AstrometryResponse {
  api_version: string
  target: ApiTarget
  catalog_pm: { pmra: number; pmdec: number; source: string; epoch: string } | null
  points: AstrometryPoint[]
  fit: unknown
  mode?: DataMode
}

export interface SpectrumPoint {
  detector: number
  wavelength_um: number
  flux_mjy: number | null
  err_mjy: number | null
  flagged: boolean
}

export interface SpectrumResponse {
  position: { ra: number; dec: number }
  points: SpectrumPoint[]
  mode?: DataMode
}

export interface GaiaSource {
  source_id: string
  ra: number
  dec: number
  g_mag: number | null
}

export interface FlagLegendItem {
  bit: number
  name: string
  description: string
  color: string
}

export interface FlagsResponse {
  frame_id: string
  legend: FlagLegendItem[]
  /** Image URL of an RGBA overlay aligned with the frame grid. */
  overlay: string
  mode?: DataMode
}

export type ErrorCode =
  | 'BAD_COORDS'
  | 'BAD_PARAM'
  | 'UNKNOWN_TARGET'
  | 'NO_FRAMES'
  | 'FRAME_NOT_FOUND'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_TIMEOUT'
  | 'INTERNAL'
  | 'NETWORK'
  | 'CLIENT_TIMEOUT'
  | 'ABORTED'
  | 'NOT_AVAILABLE'
