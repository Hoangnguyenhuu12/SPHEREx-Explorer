import { TARGETS, TARGET_BY_KEY, isTargetKey, type TargetInfo } from '../../config/targets'
import type { ObservationApi } from '../adapter'
import { ApiError } from '../errors'
import type {
  AstrometryResponse,
  FlagsResponse,
  Frame,
  FramesParams,
  FramesResponse,
  PhotometryPoint,
  ResolveResponse,
  SpectrumResponse,
} from '../types'
import { PIX_ARCSEC, grayToBitmap, hashString, makeField, mulberry32, renderField, rgbaToBitmap, toDiffGray, toGray } from './synth'

/**
 * Illustrative demo adapter. Every value here is generated for UI testing and is labelled
 * `mode: 'mock'`. Dev scenarios: add `?mock=one-frame|no-frames|error|slow|expired` to the URL.
 */

type Scenario = 'default' | 'one-frame' | 'no-frames' | 'error' | 'slow' | 'expired'

function scenario(): Scenario {
  if (typeof window === 'undefined') return 'default'
  const v = new URLSearchParams(window.location.search).get('mock')
  return (['one-frame', 'no-frames', 'error', 'slow', 'expired'] as const).find((s) => s === v) ?? 'default'
}

/** Illustrative observation dates, roughly one all-sky pass every six months. */
const DATES = ['2025-05-14', '2025-11-10', '2026-05-12', '2026-11-06']
const COMBINED_DATES = [
  { iso: '2010-05-04', mission: 'unWISE' as const, band: 'W2', wavelength: 4.6, release: 'wiseview-unwise', quality: 'verified_coadd_e000' },
  { iso: '2010-11-11', mission: 'unWISE' as const, band: 'W2', wavelength: 4.6, release: 'wiseview-unwise', quality: 'verified_coadd_e001' },
  { iso: '2014-05-07', mission: 'unWISE' as const, band: 'W2', wavelength: 4.6, release: 'wiseview-unwise', quality: 'verified_coadd_e002' },
  { iso: '2018-04-19', mission: 'unWISE' as const, band: 'W2', wavelength: 4.6, release: 'wiseview-unwise', quality: 'verified_coadd_e010' },
  { iso: '2021-04-18', mission: 'unWISE' as const, band: 'W2', wavelength: 4.6, release: 'wiseview-unwise', quality: 'verified_coadd_e016' },
  { iso: '2024-04-17', mission: 'unWISE' as const, band: 'W2', wavelength: 4.6, release: 'wiseview-unwise', quality: 'verified_coadd_e022' },
  { iso: '2025-05-05', mission: 'SPHEREx' as const, band: 'D6', wavelength: 4.7, release: 'illustrative', quality: 'screened_dr1_usable' },
  { iso: '2025-11-10', mission: 'SPHEREx' as const, band: 'D6', wavelength: 4.7, release: 'illustrative', quality: 'screened_dr1_usable' },
  { iso: '2026-05-11', mission: 'SPHEREx' as const, band: 'D6', wavelength: 4.7, release: 'illustrative', quality: 'screened_dr1_usable' },
]
const MJD_UNIX_EPOCH = 40587
const DETECTOR_CENTER_UM = [0, 0.92, 1.36, 2.02, 3.12, 4.12, 4.71]

function isoToMjd(iso: string): number {
  return Date.parse(iso + 'T00:00:00Z') / 86_400_000 + MJD_UNIX_EPOCH
}

function yearsBetween(isoA: string, isoB: string): number {
  return (Date.parse(isoB) - Date.parse(isoA)) / (365.25 * 86_400_000)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiError('ABORTED', 'Request cancelled'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new ApiError('ABORTED', 'Request cancelled'))
      },
      { once: true },
    )
  })
}

/** Relative target brightness per date and detector (illustrative). */
function targetFlux(t: TargetInfo | undefined, i: number, detector: number): number {
  if (!t) return 0
  switch (t.key) {
    case 'barnard':
      return 1.6
    case 'wise0855':
      return detector >= 5 ? 0.32 : detector === 4 ? 0.08 : 0.0
    case 'epsindib':
      return detector >= 4 ? 0.45 : 0.15
    case 'rwaur':
      return [0.9, 0.42, 0.78, 0.3][i % 4]
    case 'rdra':
      return [2.2, 0.5, 1.6, 0.7][i % 4]
  }
}

interface Sequence {
  size: number
  images: Float32Array[]
  vmax: number
  diffScale: number
  flagsRgba: Uint8ClampedArray
}

const sequences = new Map<string, Sequence>()
let expiredOnce = false

function buildSequence(key: string, p: FramesParams, count: number): { seq: Sequence; frames: Frame[]; center: { ra: number; dec: number } } {
  const t = isTargetKey(p.targetKey) ? TARGET_BY_KEY.get(p.targetKey) : undefined
  const size = Math.max(32, Math.min(128, Math.round((p.size * 3600) / PIX_ARCSEC)))
  const seed = hashString(`${p.ra.toFixed(4)}:${p.dec.toFixed(4)}`)
  const field = makeField(seed, size, Math.round(size * size * 0.0075))
  const isCombined = p.timeline === 'combined'
  const entries = isCombined
    ? COMBINED_DATES.slice(0, count === 1 ? 1 : COMBINED_DATES.length)
    : DATES.slice(0, count).map((iso) => ({
        iso,
        mission: 'SPHEREx' as const,
        band: `D${p.detector}`,
        wavelength: DETECTOR_CENTER_UM[p.detector],
        release: 'illustrative',
        quality: undefined as string | undefined,
      }))
  const midIso = entries[Math.floor((entries.length - 1) / 2)].iso
  // Proper motion in pixels per year (north up, east left).
  const pmX = t ? -t.pmRaCosDecMasYr / 1000 / PIX_ARCSEC : 0
  const pmY = t ? -t.pmDecMasYr / 1000 / PIX_ARCSEC : 0
  const c = size / 2

  const images: Float32Array[] = []
  const frames: Frame[] = []
  entries.forEach((entry, i) => {
    const dt = yearsBetween(midIso, entry.iso)
    const x = c + pmX * dt
    const y = c + pmY * dt
    const flux = targetFlux(t, i, p.detector)
    const stars = flux > 0 ? [...field, { x, y, flux }] : field
    images.push(renderField(size, stars, seed + i * 7919))
    const id = `mock-${key}-${i}`
    frames.push({
      id,
      mjd: isoToMjd(entry.iso),
      iso: entry.iso + 'T00:00:00Z',
      wavelength_um: entry.wavelength + (i % 2 ? 0.02 : -0.02),
      bandwidth_um: entry.mission === 'unWISE' ? 1.0 : 0.04,
      release: entry.release,
      survey: isCombined ? null : i + 1,
      bad_pixel_frac: t?.key === 'rdra' && i === 0 ? 0.004 : 0,
      predicted_px: t ? [Math.floor(x), Math.floor(y)] : null,
      png: `mock://${key}/${i}.png`,
      diff_png: isCombined ? null : `mock://${key}/${i}/diff.png`,
      mission: isCombined ? entry.mission : undefined,
      band_or_detector: isCombined ? entry.band : undefined,
      quality_label: entry.quality,
      source_product_id: isCombined ? `mock-${entry.mission.toLowerCase()}-${i + 1}` : undefined,
      data_mode: isCombined ? 'fixture' : undefined,
      detector: p.detector,
      t_min_mjd: isoToMjd(entry.iso) - 0.4,
      t_max_mjd: isoToMjd(entry.iso) + 0.4,
      n_exposures: 3,
    })
  })

  // Illustrative flag overlay: saturated core for bright targets, a few hot pixels.
  const flagsRgba = new Uint8ClampedArray(size * size * 4)
  const rnd = mulberry32(seed ^ 0x9e3779b9)
  for (let k = 0; k < 6; k++) {
    const idx = Math.floor(rnd() * size * size)
    flagsRgba.set([233, 72, 172, 220], idx * 4)
  }
  if (t && (t.key === 'barnard' || t.key === 'rdra')) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.floor(c) + dx
        const yy = Math.floor(c) + dy
        flagsRgba.set([255, 180, 92, 220], (yy * size + xx) * 4)
      }
  }

  let vmax = 0
  for (const im of images) for (const v of im) vmax = Math.max(vmax, v)
  const seq: Sequence = { size, images, vmax: vmax * 0.8, diffScale: Math.max(0.3, vmax * 0.35), flagsRgba }
  // The requested position is treated as the grid centre; the mock target sits there at the middle date.
  return { seq, frames, center: { ra: p.ra, dec: p.dec } }
}

export const mockApi: ObservationApi = {
  mode: 'mock',

  async health() {
    return { api_version: '0.1', status: 'ok', mode: 'mock', git_sha: null, irsa_reachable: null }
  },

  async resolve(name, signal) {
    await sleep(250, signal)
    const q = name.trim().toLowerCase().replace(/[’']/g, '')
    const hit = TARGETS.find((t) =>
      [t.name, t.shortName, t.key, ...t.aliases].some((n) => n.toLowerCase().replace(/[’'−]/g, (m) => (m === '−' ? '-' : '')).includes(q)),
    )
    if (!hit) throw new ApiError('UNKNOWN_TARGET', `No match for ${name}`, 404)
    const res: ResolveResponse = {
      api_version: '0.1',
      query: name,
      target_key: hit.key,
      name: hit.name,
      ra: hit.raDeg,
      dec: hit.decDeg,
      epoch: hit.epoch,
      pmra: hit.pmRaCosDecMasYr,
      pmdec: hit.pmDecMasYr,
      parallax_mas: null,
      kind: hit.kind,
      source: 'mock-targets-table',
    }
    return res
  },

  async frames(p, signal) {
    const sc = scenario()
    await sleep(sc === 'slow' ? 9000 : 700, signal)
    if (sc === 'error') throw new ApiError('UPSTREAM_ERROR', 'Illustrative upstream failure', 502)
    if (sc === 'no-frames') throw new ApiError('NO_FRAMES', 'Illustrative empty result', 404)
    const count = sc === 'one-frame' ? 1 : DATES.length
    const key = `${hashString(JSON.stringify(p) + sc).toString(36)}`
    const { seq, frames, center } = buildSequence(key, p, count)
    sequences.set(key, seq)
    const t = isTargetKey(p.targetKey) ? TARGET_BY_KEY.get(p.targetKey) : undefined
    const warnings: string[] = []
    if (frames.length < 3) warnings.push('FEW_FRAMES')
    if (t && (t.key === 'barnard' || t.key === 'rdra')) warnings.push('SATURATION_POSSIBLE')
    const res: FramesResponse = {
      api_version: '0.1',
      target: { ra: center.ra, dec: center.dec, name: t?.name ?? null, target_key: t?.key ?? null },
      detector: p.detector,
      grid: { width: seq.size, height: seq.size, pixscale_arcsec: PIX_ARCSEC, projection: 'TAN', center_ra: center.ra, center_dec: center.dec },
      norm: { vmin: 0, vmax: 1, stretch: 'asinh' },
      reference_frame_id: frames[0]?.id ?? null,
      frames,
      warnings,
      mode: 'mock',
      attribution: 'Illustrative demo data generated in the browser; not a SPHEREx observation.',
    }
    return res
  },

  async image(url, signal) {
    await sleep(60, signal)
    const m = /^mock:\/\/([^/]+)\/(\d+)(\/diff)?\.png$/.exec(url)
    if (!m) throw new ApiError('FRAME_NOT_FOUND', 'Unknown mock frame', 404)
    if (scenario() === 'expired' && !expiredOnce) {
      expiredOnce = true
      throw new ApiError('FRAME_NOT_FOUND', 'Illustrative expired frame', 404)
    }
    const seq = sequences.get(m[1])
    if (!seq) throw new ApiError('FRAME_NOT_FOUND', 'Sequence expired', 404)
    const i = Number(m[2])
    const img = seq.images[i]
    if (!img) throw new ApiError('FRAME_NOT_FOUND', 'Frame index out of range', 404)
    const gray = m[3] ? toDiffGray(img, seq.images[0], seq.diffScale) : toGray(img, seq.vmax)
    return grayToBitmap(gray, seq.size)
  },

  async photometry(q, signal) {
    await sleep(400, signal)
    const t = isTargetKey(q.targetKey) ? TARGET_BY_KEY.get(q.targetKey) : undefined
    const det = q.detector ?? 3
    const rnd = mulberry32(hashString(`${q.targetKey}:${det}`))
    const points: PhotometryPoint[] = DATES.map((iso, i) => {
      const base = targetFlux(t, i, det) * 40
      const err = 1.2 + rnd() * 0.8
      const flagged = t?.key === 'rdra' && i === 0
      return {
        frame_id: `phot-${i}`,
        mjd: isoToMjd(iso),
        wavelength_um: DETECTOR_CENTER_UM[det],
        detector: det,
        release: 'illustrative',
        flux_mjy: base > 0 ? +(base + (rnd() - 0.5) * err).toFixed(2) : null,
        err_mjy: base > 0 ? +err.toFixed(2) : null,
        snr: base > 0 ? +(base / err).toFixed(1) : null,
        detected: base > 0,
        flagged,
        flag_reasons: flagged ? ['SATURATED core pixels'] : [],
      }
    })
    return { api_version: '0.1', target: { ra: q.ra, dec: q.dec, name: t?.name ?? null, target_key: t?.key ?? null }, points, mode: 'mock' }
  },

  async astrometry(q, signal) {
    await sleep(400, signal)
    const t = isTargetKey(q.targetKey) ? TARGET_BY_KEY.get(q.targetKey) : undefined
    if (!t || t.change !== 'motion') {
      return { api_version: '0.1', target: { ra: q.ra, dec: q.dec, name: t?.name ?? null, target_key: t?.key ?? null }, catalog_pm: null, points: [], fit: null, mode: 'mock' }
    }
    const rnd = mulberry32(hashString(`astro:${t.key}`))
    const mid = DATES[1]
    const cosd = Math.cos((t.decDeg * Math.PI) / 180)
    const points = DATES.map((iso, i) => {
      const dt = yearsBetween(mid, iso)
      const pra = q.ra + (t.pmRaCosDecMasYr / 3.6e6 / cosd) * dt
      const pdec = q.dec + (t.pmDecMasYr / 3.6e6) * dt
      const nx = (rnd() - 0.5) * 1.2
      const ny = (rnd() - 0.5) * 1.2
      return {
        frame_id: `astro-${i}`,
        mjd: isoToMjd(iso),
        predicted: { ra: pra, dec: pdec },
        measured: { ra: pra + nx / 3600 / cosd, dec: pdec + ny / 3600, err_arcsec: 0.9 },
        offset_arcsec: +Math.hypot(nx, ny).toFixed(2),
        measured_px: null,
      }
    })
    const res: AstrometryResponse = {
      api_version: '0.1',
      target: { ra: q.ra, dec: q.dec, name: t.name, target_key: t.key },
      catalog_pm: { pmra: t.pmRaCosDecMasYr, pmdec: t.pmDecMasYr, source: 'SIMBAD', epoch: 'J2000' },
      points,
      fit: null,
      mode: 'mock',
    }
    return res
  },

  async spectrum(q, signal) {
    await sleep(350, signal)
    const rnd = mulberry32(hashString(`spec:${q.ra.toFixed(3)}:${q.dec.toFixed(3)}`))
    const temp = 0.6 + rnd() * 2
    const points = [1, 2, 3, 4, 5, 6].map((d) => {
      const w = DETECTOR_CENTER_UM[d]
      const f = 30 * Math.exp(-((w - temp) ** 2) / 3) + rnd() * 2
      return { detector: d, wavelength_um: w, flux_mjy: +f.toFixed(2), err_mjy: +(0.8 + rnd()).toFixed(2), flagged: false }
    })
    const res: SpectrumResponse = { position: q, points, mode: 'mock' }
    return res
  },

  async flags(frameId, signal) {
    await sleep(200, signal)
    const key = /^mock-(.+)-\d+$/.exec(frameId)?.[1]
    const seq = key ? sequences.get(key) : undefined
    if (!seq) throw new ApiError('FRAME_NOT_FOUND', 'Sequence expired', 404)
    const bitmap = await rgbaToBitmap(seq.flagsRgba, seq.size)
    const canvas = new OffscreenCanvas(seq.size, seq.size)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
    const blob = await canvas.convertToBlob()
    const res: FlagsResponse = {
      frame_id: frameId,
      overlay: URL.createObjectURL(blob),
      legend: [
        { bit: 0, name: 'Saturated', description: 'Too bright: the detector stopped counting, so brightness here is not reliable.', color: '#FFB45C' },
        { bit: 1, name: 'Hot pixel', description: 'A detector pixel that reads high even without light.', color: '#E948AC' },
      ],
      mode: 'mock',
    }
    return res
  },

  async hipsLayers() {
    return { api_version: '0.1', source: 'mock', layers: [] }
  },

  async skyArchiveGaia() {
    throw new ApiError('NOT_AVAILABLE', 'Mock mode uses VizieR Gaia catalog', 404)
  },

  async combinedGaiaOverlays(sequenceId, signal) {
    await sleep(120, signal)
    const targetKey = sequenceId.split(':')[0]
    const t = isTargetKey(targetKey) ? TARGET_BY_KEY.get(targetKey) : undefined
    if (!t) throw new ApiError('NOT_AVAILABLE', 'Unknown mock combined sequence', 404)
    const size = Math.max(32, Math.min(128, Math.round((0.1667 * 3600) / PIX_ARCSEC)))
    const seed = hashString(`${t.raDeg.toFixed(4)}:${t.decDeg.toFixed(4)}`)
    const brightest = [...makeField(seed, size, Math.round(size * size * 0.0075))]
      .sort((a, b) => b.flux - a.flux)
      .slice(0, 12)
    const overlays = COMBINED_DATES.flatMap((entry, idx) =>
      brightest.map((star, j) => ({
        frame_index: idx + 1,
        source_id: `mock-gaia-${j + 1}`,
        observed_mjd: isoToMjd(entry.iso),
        catalog_ra_deg: t.raDeg,
        catalog_dec_deg: t.decDeg,
        propagated_ra_deg: t.raDeg,
        propagated_dec_deg: t.decDeg,
        pixel_x: star.x - 0.5,
        pixel_y_png: star.y - 0.5,
        in_frame: true,
        has_proper_motion: true,
        motion_status: 'propagated_pm' as const,
        g_mag: +(13.2 + j * 0.45).toFixed(2),
      })),
    )
    return {
      api_version: '0.1',
      sequence_id: sequenceId,
      source: 'illustrative-mock',
      gaia_propagation_model: 'angular_proper_motion_only',
      annual_parallax_included: false,
      observer_ephemeris_included: false,
      target_astrometry_source: 'Illustrative demo',
      overlays,
    }
  },

  async createViewJob(body, signal) {
    const res = await mockApi.frames(
      {
        ra: body.ra ?? 269.4521,
        dec: body.dec ?? 4.6934,
        detector: body.detector ?? 6,
        size: (body.fov_arcmin ?? 8) / 60,
        maxFrames: 12,
      },
      signal,
    )
    return {
      job_id: `mock-job-${hashString(JSON.stringify(body)).toString(36)}`,
      status: 'ready',
      progress: { found: res.frames.length, done: res.frames.length },
      queue_position: 0,
      target: {
        ra: res.target.ra,
        dec: res.target.dec,
        name: res.target.name,
        target_key: res.target.target_key,
        resolved_by: 'mock',
      },
      detector: res.detector,
      fov_arcmin: body.fov_arcmin ?? 8,
      frames: res.frames,
      error: null,
    }
  },

  async getViewJob(jobId) {
    return {
      job_id: jobId,
      status: 'ready',
      progress: { found: 0, done: 0 },
      queue_position: 0,
      target: { ra: 269.4521, dec: 4.6934, name: null, target_key: null, resolved_by: null },
      detector: 6,
      fov_arcmin: 8,
      frames: [],
      error: null,
    }
  },
}
