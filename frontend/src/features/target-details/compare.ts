import type { Frame, Grid, WarningCode } from '../../shared/api/types'
import { formatAngularArcsec, hasValidWcs, safePixelToSky, sphericalAngularDistanceArcsec } from '../blink/wcs'
import { serializeSelection, type Selection, type SequenceChoice } from '../target-search/explorer-url'
import { frameBand, frameSourceLabel, framesDifferInMissionOrBand } from './timeline'

export interface CompareMarkInfo {
  px: [number, number]
  sky: { ra: number; dec: number } | null
}

export interface CompareMeasurement {
  hasWcs: boolean
  markA: CompareMarkInfo | null
  markB: CompareMarkInfo | null
  angularOffsetArcsec: number | null
  formattedOffset: string | null
  qualityLimitations: string[]
}

export function computeCompareMeasurement(params: {
  grid: Grid | null | undefined
  frameA: Frame | null
  frameB: Frame | null
  markA: [number, number] | null
  markB: [number, number] | null
  warnings?: WarningCode[]
  demo?: boolean
}): CompareMeasurement {
  const { grid, frameA, frameB, markA, markB, warnings = [], demo = false } = params
  const hasWcs = hasValidWcs(grid)

  const infoA: CompareMarkInfo | null = markA
    ? { px: markA, sky: hasWcs ? safePixelToSky(grid, markA[0], markA[1]) : null }
    : null
  const infoB: CompareMarkInfo | null = markB
    ? { px: markB, sky: hasWcs ? safePixelToSky(grid, markB[0], markB[1]) : null }
    : null

  let angularOffsetArcsec: number | null = null
  if (infoA?.sky && infoB?.sky) {
    angularOffsetArcsec = sphericalAngularDistanceArcsec(infoA.sky.ra, infoA.sky.dec, infoB.sky.ra, infoB.sky.dec)
  }

  const qualityLimitations: string[] = []
  if (!hasWcs) {
    qualityLimitations.push(
      'Missing or invalid WCS grid metadata: marked pixel coordinates cannot be converted to RA/Dec or arcseconds.',
    )
  } else {
    qualityLimitations.push(
      `Manual click estimate on ${grid.pixscale_arcsec}″/px grid (±~${grid.pixscale_arcsec.toFixed(1)}″ positional uncertainty per epoch; spherical great-circle formula).`,
    )
  }

  if (frameA && frameB && framesDifferInMissionOrBand(frameA, frameB)) {
    qualityLimitations.push(
      `Cross-channel comparison (${frameSourceLabel(frameA)} vs ${frameSourceLabel(frameB)}): PSF size and wavelength differ between frames.`,
    )
  }

  const flaggedFrames = [
    frameA && /flagged|saturated|bad/i.test(frameA.quality_label ?? '')
      ? `Date A (${frameA.quality_label})`
      : null,
    frameB && /flagged|saturated|bad/i.test(frameB.quality_label ?? '')
      ? `Date B (${frameB.quality_label})`
      : null,
  ].filter(Boolean)
  if (flaggedFrames.length > 0) {
    qualityLimitations.push(`Quality flag note on ${flaggedFrames.join(' and ')}: inspect original images carefully.`)
  } else if (warnings.includes('SATURATION_POSSIBLE')) {
    qualityLimitations.push('Saturation possible in bright epochs of this sequence; check original frames before interpreting brightness.')
  }

  const badFracNotes = [
    frameA?.bad_pixel_frac != null && frameA.bad_pixel_frac > 0.05
      ? `Date A flagged pixels: ${(frameA.bad_pixel_frac * 100).toFixed(1)}%`
      : null,
    frameB?.bad_pixel_frac != null && frameB.bad_pixel_frac > 0.05
      ? `Date B flagged pixels: ${(frameB.bad_pixel_frac * 100).toFixed(1)}%`
      : null,
  ].filter(Boolean)
  if (badFracNotes.length > 0) {
    qualityLimitations.push(badFracNotes.join(' · '))
  }

  if (demo) {
    qualityLimitations.push('Illustrative demo sequence (synthetic fixture data, not real archive pixels).')
  }

  return {
    hasWcs,
    markA: infoA,
    markB: infoB,
    angularOffsetArcsec,
    formattedOffset: angularOffsetArcsec != null ? formatAngularArcsec(angularOffsetArcsec) : null,
    qualityLimitations,
  }
}

export function buildComparisonShareUrl(params: {
  origin: string
  pathname: string
  q: string
  detector: number
  seq?: SequenceChoice
  frameA?: Frame | null
  frameB?: Frame | null
  markA: [number, number] | null
  markB: [number, number] | null
  gaia: boolean
  fovArcmin: number | null
}): string {
  const band = params.frameA
    ? frameBand(params.frameA, params.detector)
    : params.detector
      ? `D${params.detector}`
      : undefined
  const sel: Selection = {
    q: params.q,
    detector: params.detector,
    fovArcmin: params.fovArcmin,
    compare: true,
    seq: params.seq,
    band,
    frameA: params.frameA?.id,
    frameB: params.frameB?.id,
    markA: params.markA ?? undefined,
    markB: params.markB ?? undefined,
    gaia: params.gaia,
  }
  return `${params.origin}${params.pathname}${serializeSelection(sel)}`
}
