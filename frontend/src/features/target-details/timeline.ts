import type { Frame, GaiaFrameOverlay } from '../../shared/api/types'
import { formatUtcDate } from './format'

export type TimelineMission = 'unWISE' | 'SPHEREx'

export interface TimelinePoint {
  index: number
  mjd: number
  pos: number
  mission: TimelineMission
  band: string
  dateLabel: string
}

export interface TimelineGap {
  fromIndex: number
  toIndex: number
  startPos: number
  endPos: number
  days: number
  label: string
  crossMission: boolean
}

export interface MissionGroup {
  mission: TimelineMission
  band: string
  count: number
}

export interface TimelineSummary {
  mjdMin: number
  mjdMax: number
  spanDays: number
  points: TimelinePoint[]
  gaps: TimelineGap[]
  missions: MissionGroup[]
  hasMixedMissionsOrBands: boolean
}

const CLUSTER_GAP_DAYS = 270
const MISSION_GAP_MIN_DAYS = 60

export function frameMission(frame: Frame): TimelineMission {
  return frame.mission === 'unWISE' ? 'unWISE' : 'SPHEREx'
}

export function frameBand(frame: Frame, fallbackDetector?: number): string {
  if (frame.band_or_detector) return frame.band_or_detector
  if (frame.detector != null) return `D${frame.detector}`
  if (fallbackDetector != null) return `D${fallbackDetector}`
  return frame.mission === 'unWISE' ? 'W2' : 'D6'
}

export function frameSourceLabel(frame: Frame, fallbackDetector?: number): string {
  const mission = frameMission(frame)
  const band = frameBand(frame, fallbackDetector)
  if (mission === 'unWISE') {
    const rel = frame.release && frame.release !== 'wiseview-unwise' ? ` (${frame.release})` : ''
    return `unWISE ${band}${rel}`
  }
  const rel = frame.release && frame.release !== 'illustrative' ? ` (${frame.release.toUpperCase()})` : ''
  return `SPHEREx ${band}${rel}`
}

export function framesDifferInMissionOrBand(a: Frame | null | undefined, b: Frame | null | undefined): boolean {
  if (!a || !b) return false
  if (frameMission(a) !== frameMission(b)) return true
  if (frameBand(a) !== frameBand(b)) return true
  return false
}

export function formatGapDuration(days: number): string {
  if (days >= 500) {
    const years = days / 365.25
    return `${years.toFixed(1)} yr gap`
  }
  return `${Math.round(days)} d gap`
}

export interface ComparePairResolution {
  pair: [number, number]
  missingA: string | null
  missingB: string | null
}

function isFrameQualityClean(f: Frame): boolean {
  if (f.quality_label && /flagged|saturated|bad/i.test(f.quality_label)) return false
  if (!f.quality_label) return true
  return /verified|usable|screened/i.test(f.quality_label)
}

/**
 * Pick the default two epochs for "Compare two dates".
 * - For proper-motion targets (and default): earliest & latest verified unWISE W2 frames.
 * - For variable-brightness targets: prefer quality-clean same-band frames (non-flagged/non-saturated)
 *   spanning enough time so brightness can change without mixing instruments/bands.
 */
export function pickDefaultComparePair(frames: readonly Frame[], change: 'motion' | 'brightness' = 'motion'): [number, number] {
  if (frames.length <= 1) return [0, 0]
  const verifiedUnwiseW2: number[] = []
  const verifiedSpherexSameBand: number[] = []
  const anyUnwise: number[] = []

  frames.forEach((f, idx) => {
    const clean = isFrameQualityClean(f)
    if (f.mission === 'unWISE') {
      anyUnwise.push(idx)
      const isW2 = f.band_or_detector === 'W2' || (f.wavelength_um != null && f.wavelength_um >= 4.0 && f.wavelength_um <= 5.0)
      if (isW2 && clean) verifiedUnwiseW2.push(idx)
    } else if (clean) {
      verifiedSpherexSameBand.push(idx)
    }
  })

  if (change === 'brightness' && verifiedSpherexSameBand.length >= 2) {
    return [verifiedSpherexSameBand[0], verifiedSpherexSameBand[verifiedSpherexSameBand.length - 1]]
  }
  if (verifiedUnwiseW2.length >= 2) {
    return [verifiedUnwiseW2[0], verifiedUnwiseW2[verifiedUnwiseW2.length - 1]]
  }
  if (anyUnwise.length >= 2) {
    return [anyUnwise[0], anyUnwise[anyUnwise.length - 1]]
  }
  return [0, frames.length - 1]
}

/**
 * Resolve requested stable frame IDs (`fa`, `fb`) against the loaded sequence.
 * Reports missing IDs clearly while falling back safely to valid frames so the user can pick again.
 */
export function resolveComparePair(
  frames: readonly Frame[],
  frameAId?: string | null,
  frameBId?: string | null,
  change: 'motion' | 'brightness' = 'motion',
): ComparePairResolution {
  const def = pickDefaultComparePair(frames, change)
  if (frames.length === 0) {
    return { pair: [0, 0], missingA: frameAId ?? null, missingB: frameBId ?? null }
  }
  const idxA = frameAId ? frames.findIndex((f) => f.id === frameAId) : -1
  const idxB = frameBId ? frames.findIndex((f) => f.id === frameBId) : -1
  const missingA = frameAId && idxA === -1 ? frameAId : null
  const missingB = frameBId && idxB === -1 ? frameBId : null

  return {
    pair: [idxA >= 0 ? idxA : def[0], idxB >= 0 ? idxB : def[1]],
    missingA,
    missingB,
  }
}

/**
 * Build time-scaled positions, mission groupings, and real metadata gaps between clusters.
 */
export function analyzeTimeline(frames: readonly Frame[], fallbackDetector?: number): TimelineSummary {
  if (frames.length === 0) {
    return { mjdMin: 0, mjdMax: 0, spanDays: 0, points: [], gaps: [], missions: [], hasMixedMissionsOrBands: false }
  }
  const mjdMin = frames[0].mjd
  const mjdMax = frames[frames.length - 1].mjd
  const spanDays = Math.max(0, mjdMax - mjdMin)

  const points: TimelinePoint[] = frames.map((f, index) => ({
    index,
    mjd: f.mjd,
    pos: spanDays > 0 ? (f.mjd - mjdMin) / spanDays : frames.length > 1 ? index / (frames.length - 1) : 0.5,
    mission: frameMission(f),
    band: frameBand(f, fallbackDetector),
    dateLabel: formatUtcDate(f.iso),
  }))

  const gaps: TimelineGap[] = []
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i]
    const b = frames[i + 1]
    const days = b.mjd - a.mjd
    const crossMission = frameMission(a) !== frameMission(b)
    if (days >= CLUSTER_GAP_DAYS || (crossMission && days >= MISSION_GAP_MIN_DAYS)) {
      gaps.push({
        fromIndex: i,
        toIndex: i + 1,
        startPos: points[i].pos,
        endPos: points[i + 1].pos,
        days,
        label: formatGapDuration(days),
        crossMission,
      })
    }
  }

  const missionMap = new Map<string, MissionGroup>()
  for (const pt of points) {
    const key = `${pt.mission}:${pt.band}`
    const existing = missionMap.get(key)
    if (existing) existing.count++
    else missionMap.set(key, { mission: pt.mission, band: pt.band, count: 1 })
  }
  const missions = Array.from(missionMap.values())

  return {
    mjdMin,
    mjdMax,
    spanDays,
    points,
    gaps,
    missions,
    hasMixedMissionsOrBands: missions.length > 1,
  }
}

export interface SelectedGaiaReference {
  selected: GaiaFrameOverlay[]
  inFrameCount: number
  propagatedCount: number
  staticCount: number
}

/**
 * Select a small set of bright, spatially well-separated Gaia DR3 reference stars
 * so the image stays clean and newcomers can orient themselves quickly.
 */
export function selectReferenceGaiaOverlays(
  overlays: readonly GaiaFrameOverlay[],
  frameIndex: number,
  gridW: number,
  gridH: number,
  maxCount = 6,
): SelectedGaiaReference {
  const inFrame = overlays.filter((o) => o.frame_index === frameIndex && o.in_frame)
  let propagatedCount = 0
  let staticCount = 0
  for (const o of inFrame) {
    if (o.motion_status === 'propagated_pm') propagatedCount++
    else staticCount++
  }

  const margin = Math.min(4, Math.floor(Math.min(gridW, gridH) * 0.08))
  const interior = inFrame.filter(
    (o) => o.pixel_x >= margin && o.pixel_x <= gridW - margin && o.pixel_y_png >= margin && o.pixel_y_png <= gridH - margin,
  )
  const pool = [...(interior.length >= 3 ? interior : inFrame)].sort((a, b) => {
    const aProp = a.motion_status === 'propagated_pm' ? 0 : 1
    const bProp = b.motion_status === 'propagated_pm' ? 0 : 1
    if (aProp !== bProp) return aProp - bProp
    const aMag = a.g_mag ?? 99
    const bMag = b.g_mag ?? 99
    if (aMag !== bMag) return aMag - bMag
    return a.source_id.localeCompare(b.source_id)
  })

  const minSepSq = 8 * 8
  const selected: GaiaFrameOverlay[] = []
  for (const cand of pool) {
    if (selected.length >= maxCount) break
    const tooClose = selected.some((s) => {
      const dx = s.pixel_x - cand.pixel_x
      const dy = s.pixel_y_png - cand.pixel_y_png
      return dx * dx + dy * dy < minSepSq
    })
    if (!tooClose) selected.push(cand)
  }

  // Fallback if separation was too strict for a tiny grid.
  if (selected.length < Math.min(3, pool.length)) {
    for (const cand of pool) {
      if (selected.length >= maxCount) break
      if (!selected.includes(cand)) selected.push(cand)
    }
  }

  return {
    selected,
    inFrameCount: inFrame.length,
    propagatedCount,
    staticCount,
  }
}
