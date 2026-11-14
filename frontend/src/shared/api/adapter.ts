import type {
  AstrometryResponse,
  CombinedGaiaOverlaysResponse,
  DataMode,
  FlagsResponse,
  FramesParams,
  FramesResponse,
  HealthResponse,
  HipsLayersResponse,
  PhotometryResponse,
  ResolveResponse,
  SkyArchiveGaiaResponse,
  SpectrumResponse,
} from './types'

export interface TargetQuery {
  ra: number
  dec: number
  detector?: number
  targetKey?: string
}

/**
 * One adapter interface; the app chooses exactly one implementation at build time.
 * No runtime guessing between incompatible contracts.
 */
export interface ObservationApi {
  readonly mode: DataMode
  health(signal?: AbortSignal): Promise<HealthResponse>
  resolve(name: string, signal?: AbortSignal): Promise<ResolveResponse>
  frames(params: FramesParams, signal?: AbortSignal): Promise<FramesResponse>
  /** Fetches and decodes one PNG. Throws ApiError FRAME_NOT_FOUND on HTTP 404. */
  image(url: string, signal?: AbortSignal): Promise<ImageBitmap>
  photometry(q: TargetQuery, signal?: AbortSignal): Promise<PhotometryResponse>
  astrometry(q: TargetQuery, signal?: AbortSignal): Promise<AstrometryResponse>
  spectrum(q: { ra: number; dec: number }, signal?: AbortSignal): Promise<SpectrumResponse>
  flags(frameId: string, signal?: AbortSignal): Promise<FlagsResponse>
  hipsLayers(signal?: AbortSignal): Promise<HipsLayersResponse>
  skyArchiveGaia(targetKey: string, signal?: AbortSignal): Promise<SkyArchiveGaiaResponse>
  combinedGaiaOverlays(sequenceId: string, signal?: AbortSignal): Promise<CombinedGaiaOverlaysResponse>
}
