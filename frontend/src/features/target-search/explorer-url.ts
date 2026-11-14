import { isTargetKey, TARGET_BY_KEY, type TargetKey } from '../../shared/config/targets'
import { parseCoordinates, type Coords } from './coordinates'

/** Shareable selection of The Eyes: `?q=&det=&fov=`. One codec, one source of truth. */

export interface Selection {
  /** Target key, coordinate text or free name. */
  q: string
  detector: number
  /** Cutout display field of view in arcminutes (zoom only; never refetches). */
  fovArcmin: number | null
}

export type ResolvedQuery =
  | { kind: 'target'; key: TargetKey; coords: Coords }
  | { kind: 'coords'; coords: Coords }
  | { kind: 'name'; name: string }
  | { kind: 'none' }

const FOV_MIN = 1
const FOV_MAX = 10

export function parseSelection(search: string): Selection {
  const p = new URLSearchParams(search)
  const det = Number(p.get('det'))
  const fov = Number(p.get('fov'))
  return {
    q: (p.get('q') ?? '').trim(),
    detector: Number.isInteger(det) && det >= 1 && det <= 6 ? det : 0,
    fovArcmin: Number.isFinite(fov) && fov >= FOV_MIN && fov <= FOV_MAX ? fov : null,
  }
}

export function serializeSelection(sel: Selection): string {
  const p = new URLSearchParams()
  if (sel.q) p.set('q', sel.q)
  if (sel.detector) p.set('det', String(sel.detector))
  if (sel.fovArcmin != null) p.set('fov', String(+sel.fovArcmin.toFixed(1)))
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
