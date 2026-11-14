/**
 * Adapter for the sky globe (src/globe), which was written against the training frontend's
 * `targets` module. The source of truth is shared/config/targets.ts.
 */
import { TARGETS } from './shared/config/targets'

export interface TargetPreset {
  key: string
  name: string
  ra: number
  dec: number
  objectType: string
}

export const TARGET_PRESETS: readonly TargetPreset[] = TARGETS.map((t) => ({
  key: t.key,
  name: t.name,
  ra: t.raDeg,
  dec: t.decDeg,
  objectType: t.kind,
}))
