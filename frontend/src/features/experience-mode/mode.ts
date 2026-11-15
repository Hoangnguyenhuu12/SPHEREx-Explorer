import type { FramesResponse, Grid } from '../../shared/api/types'
import { pixelToSky } from '../blink/wcs'
import { formatDecDms, formatRaHms } from '../target-search/coordinates'

export type ExperienceMode = 'explore' | 'science'
export type CanvasStretch = 'default' | 'high-contrast' | 'invert'

const MODE_STORAGE_KEY = 'spherex-explorer.mode.v1'

export function readExperienceMode(search = ''): ExperienceMode {
  const param = new URLSearchParams(search).get('mode')
  if (param === 'explore' || param === 'science') return param
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(MODE_STORAGE_KEY) : null
    if (saved === 'explore' || saved === 'science') return saved
  } catch {
    /* ignore storage errors in private mode */
  }
  return 'explore'
}

export function writeExperienceMode(mode: ExperienceMode): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(MODE_STORAGE_KEY, mode)
  } catch {
    /* ignore storage errors in private mode */
  }
}

export interface RulerMeasurement {
  p1: [number, number]
  p2: [number, number]
  sky1: { ra: number; dec: number }
  sky2: { ra: number; dec: number }
  draArcsec: number
  ddecArcsec: number
  sepArcsec: number
  paDeg: number
  baselineYears: number | null
  properMotionMasYr: number | null
}

/**
 * Computes astronomical angular separation (arcsec), Position Angle (deg North through East),
 * and optional proper motion rate (mas/yr) between two pixel positions on the TAN grid.
 */
export function measureAngularOffset(
  grid: Grid,
  p1: [number, number],
  p2: [number, number],
  mjd1?: number | null,
  mjd2?: number | null,
): RulerMeasurement {
  const sky1 = pixelToSky(grid, p1[0], p1[1])
  const sky2 = pixelToSky(grid, p2[0], p2[1])
  const cosDec = Math.cos((grid.center_dec * Math.PI) / 180)
  const draDeg = ((sky2.ra - sky1.ra + 540) % 360) - 180
  const draArcsec = draDeg * cosDec * 3600
  const ddecArcsec = (sky2.dec - sky1.dec) * 3600
  const sepArcsec = Math.hypot(draArcsec, ddecArcsec)
  const paDeg = sepArcsec < 1e-6 ? 0 : (((Math.atan2(draArcsec, ddecArcsec) * 180) / Math.PI) + 360) % 360

  let baselineYears: number | null = null
  let properMotionMasYr: number | null = null
  if (mjd1 != null && mjd2 != null && Math.abs(mjd2 - mjd1) >= 1) {
    baselineYears = Math.abs(mjd2 - mjd1) / 365.25
    properMotionMasYr = (sepArcsec * 1000) / baselineYears
  }

  return {
    p1,
    p2,
    sky1,
    sky2,
    draArcsec,
    ddecArcsec,
    sepArcsec,
    paDeg,
    baselineYears,
    properMotionMasYr,
  }
}

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildObservationsCsv(data: FramesResponse): string {
  const headers = [
    'frame_index',
    'id',
    'mission',
    'release',
    'band_or_detector',
    'mjd',
    'utc_iso',
    'wavelength_um',
    'bandwidth_um',
    'bad_pixel_frac',
    'quality_label',
    'source_product_id',
    'png_url',
  ]
  const rows = data.frames.map((f, idx) =>
    [
      idx + 1,
      f.id,
      f.mission ?? 'SPHEREx',
      f.release ?? '',
      f.band_or_detector ?? `D${data.detector}`,
      f.mjd,
      f.iso,
      f.wavelength_um ?? '',
      f.bandwidth_um ?? '',
      f.bad_pixel_frac ?? '',
      f.quality_label ?? '',
      f.source_product_id ?? '',
      f.png,
    ]
      .map(csvCell)
      .join(','),
  )
  return [headers.join(','), ...rows].join('\n')
}

export function buildPythonSnippet(params: {
  targetName: string
  targetKey?: string
  ra: number
  dec: number
  detector: number
  fitsUrl?: string | null
  manifestUrl?: string | null
}): string {
  const { targetName, ra, dec, detector, fitsUrl, manifestUrl } = params
  const lines = [
    `# Reproducible SPHEREx / unWISE inspection for ${targetName}`,
    `# ICRS coordinates: RA=${ra.toFixed(6)} deg, Dec=${dec.toFixed(6)} deg (Detector D${detector})`,
    `import requests`,
  ]
  if (manifestUrl) {
    lines.push(
      ``,
      `manifest = requests.get("${manifestUrl}", timeout=30).json()`,
      `print(f"Sequence {manifest['sequence_id']}: {manifest['frame_count']} frames")`,
    )
  }
  if (fitsUrl) {
    lines.push(
      `from astropy.io import fits`,
      `from astropy.wcs import WCS`,
      ``,
      `with fits.open("${fitsUrl}") as hdul:`,
      `    hdul.info()`,
      `    cube = hdul[0].data`,
      `    wcs = WCS(hdul[0].header, naxis=2)`,
      `    print("Aligned cube shape:", cube.shape)`,
    )
  }
  return lines.join('\n')
}

export interface ForumCandidatePrefill {
  title: string
  body: string
  links: string[]
}

export function buildForumCandidatePrefill(params: {
  targetName: string
  targetKey?: string
  coords: { ra: number; dec: number }
  picked?: { ra: number; dec: number; x: number; y: number } | null
  detector: number
  frame?: {
    mjd: number
    iso: string
    mission?: string | null
    release?: string | null
    band_or_detector?: string | null
  } | null
  shareUrl: string
  rulerMeasurement?: RulerMeasurement | null
}): ForumCandidatePrefill {
  const pos = params.picked ?? params.coords
  const raHms = formatRaHms(pos.ra)
  const decDms = formatDecDms(pos.dec)
  const missionBand = params.frame
    ? `${params.frame.mission ?? 'SPHEREx'} ${params.frame.band_or_detector ?? `D${params.detector}`}`
    : `SPHEREx D${params.detector}`

  const title = `Candidate report near ${params.targetName} (${raHms} ${decDms})`
  const tableRows = [
    `| Field | Value |`,
    `| :--- | :--- |`,
    `| **Field / Target** | ${params.targetName}${params.targetKey ? ` (\`${params.targetKey}\`)` : ''} |`,
    `| **Candidate ICRS (RA, Dec)** | \`${raHms} ${decDms}\` (${pos.ra.toFixed(6)}°, ${pos.dec.toFixed(6)}°) |`,
    params.picked ? `| **Image Pixel (x, y)** | \`(${params.picked.x}, ${params.picked.y})\` |` : null,
    `| **Channel / Detector** | ${missionBand} |`,
    params.frame ? `| **Active Epoch** | ${params.frame.iso} (MJD ${params.frame.mjd.toFixed(3)}) |` : null,
    params.frame?.release ? `| **Data Release** | \`${params.frame.release}\` |` : null,
    params.rulerMeasurement
      ? `| **Measured Offset** | ${params.rulerMeasurement.sepArcsec.toFixed(2)}″ at PA ${params.rulerMeasurement.paDeg.toFixed(1)}°${
          params.rulerMeasurement.properMotionMasYr != null
            ? ` (~${params.rulerMeasurement.properMotionMasYr.toFixed(0)} mas/yr)`
            : ''
        } |`
      : null,
  ].filter(Boolean)

  const body = [
    `## Observation Summary`,
    ``,
    ...tableRows,
    ``,
    `## What Changed?`,
    `- [ ] Proper motion (position shifts between epochs)`,
    `- [ ] Brightness variability (flux changes across dates or channels)`,
    `- [ ] Possible artifact / saturation check needed`,
    ``,
    `## Notes & Interpretation`,
    `Describe what you noticed when stepping or blinking through the frames:`,
    ``,
  ].join('\n')

  const links = params.shareUrl ? [params.shareUrl] : []

  return { title, body, links }
}
