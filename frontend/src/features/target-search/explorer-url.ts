import { isTargetKey, TARGET_BY_KEY, type TargetKey } from '../../shared/config/targets'
import { parseCoordinates, type Coords } from './coordinates'

/**
 * Shareable selection of The Eyes:
 * `?q=&det=&fov=&compare=&seq=&band=&fa=&fb=&ma=&mb=&gaia=&pred=`.
 * One codec, one source of truth.
 */

export type SequenceChoice = 'combined' | 'spherex'

export interface Selection {
  /** Target key, coordinate text or free name. */
  q: string
  detector: number
  /** Cutout display field of view in arcminutes (zoom only; never refetches). */
  fovArcmin: number | null
  /** Open directly in Compare two dates mode (set by the homepage CTA or shared compare link). */
  compare?: boolean
  /** Sequence pipeline identifier (`combined` unWISE+SPHEREx or `spherex` only). */
  seq?: SequenceChoice
  /** Optional band or detector tag for human-readable trace / cross-check. */
  band?: string
  /** Stable frame IDs for Compare Date A and Date B. */
  frameA?: string
  frameB?: string
  /** User-marked image pixel coordinates [x, y] on Date A and Date B. */
  markA?: [number, number]
  markB?: [number, number]
  /** Explicit Gaia overlay state (`1` = on, `0` = off). */
  gaia?: boolean
  /** Explicit predicted target crosshair state (`1` = on, `0` = off). */
  pred?: boolean
}

export type ResolvedQuery =
  | { kind: 'target'; key: TargetKey; coords: Coords }
  | { kind: 'coords'; coords: Coords }
  | { kind: 'name'; name: string }
  | { kind: 'none' }

const FOV_MIN = 1
const FOV_MAX = 10
const MAX_PIXEL_COORD = 4096

function parsePixelPair(raw: string | null): [number, number] | undefined {
  if (!raw) return undefined
  const parts = raw.split(',').map((s) => Number(s.trim()))
  if (parts.length !== 2) return undefined
  const [x, y] = parts
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined
  if (x < 0 || y < 0 || x >= MAX_PIXEL_COORD || y >= MAX_PIXEL_COORD) return undefined
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
}

function formatPixelPair(px: [number, number]): string {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10))
  return `${fmt(px[0])},${fmt(px[1])}`
}

function parseBoolParam(raw: string | null): boolean | undefined {
  if (raw === '1' || raw === 'true') return true
  if (raw === '0' || raw === 'false') return false
  return undefined
}

function parseSeqParam(raw: string | null): SequenceChoice | undefined {
  if (!raw) return undefined
  const v = raw.trim().toLowerCase()
  if (v === 'combined' || v.includes('unwise')) return 'combined'
  if (v === 'spherex') return 'spherex'
  return undefined
}

export function parseSelection(search: string): Selection {
  const p = new URLSearchParams(search)
  const det = Number(p.get('det'))
  const fov = Number(p.get('fov'))
  const compareRaw = p.get('compare')
  const sel: Selection = {
    q: (p.get('q') ?? '').trim(),
    detector: Number.isInteger(det) && det >= 1 && det <= 6 ? det : 0,
    fovArcmin: Number.isFinite(fov) && fov >= FOV_MIN && fov <= FOV_MAX ? fov : null,
  }
  if (compareRaw === '1' || compareRaw === 'true') sel.compare = true
  const seq = parseSeqParam(p.get('seq'))
  if (seq) sel.seq = seq
  const band = p.get('band')?.trim()
  if (band) sel.band = band
  const fa = p.get('fa')?.trim()
  if (fa) sel.frameA = fa
  const fb = p.get('fb')?.trim()
  if (fb) sel.frameB = fb
  const ma = parsePixelPair(p.get('ma'))
  if (ma) sel.markA = ma
  const mb = parsePixelPair(p.get('mb'))
  if (mb) sel.markB = mb
  const gaia = parseBoolParam(p.get('gaia'))
  if (gaia !== undefined) sel.gaia = gaia
  const pred = parseBoolParam(p.get('pred'))
  if (pred !== undefined) sel.pred = pred
  return sel
}

export function serializeSelection(sel: Selection): string {
  const p = new URLSearchParams()
  if (sel.q) p.set('q', sel.q)
  if (sel.detector) p.set('det', String(sel.detector))
  if (sel.fovArcmin != null) p.set('fov', String(+sel.fovArcmin.toFixed(1)))
  if (sel.compare) p.set('compare', '1')
  if (sel.seq) p.set('seq', sel.seq)
  if (sel.band) p.set('band', sel.band)
  if (sel.frameA) p.set('fa', sel.frameA)
  if (sel.frameB) p.set('fb', sel.frameB)
  if (sel.markA) p.set('ma', formatPixelPair(sel.markA))
  if (sel.markB) p.set('mb', formatPixelPair(sel.markB))
  if (sel.gaia !== undefined) p.set('gaia', sel.gaia ? '1' : '0')
  if (sel.pred !== undefined) p.set('pred', sel.pred ? '1' : '0')
  const s = p.toString()
  return s ? `?${s}` : ''
}

export function resolveQuery(q: string): ResolvedQuery {
  const trimmed = q.trim()
  if (!trimmed) return { kind: 'none' }
  if (isTargetKey(trimmed)) {
    const t = TARGET_BY_KEY.get(trimmed)!
    return { kind: 'target', key: t.key, coords: { ra: t.raDeg, dec: t.decDeg } }
  }
  const parsed = parseCoordinates(trimmed)
  if (parsed.ok) return { kind: 'coords', coords: parsed.coords }
  return { kind: 'name', name: trimmed }
}
