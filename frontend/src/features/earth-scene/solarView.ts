/**
 * Two views of the Where-are-you scene and the transition between them (pure maths, no rendering):
 * - Earth view (t = 0): Earth at the centre, the Sun up and to the left, as before.
 * - Solar view (t = 1): the Sun at the centre, Earth on its yearly orbit, SPHEREx still around Earth.
 * Sizes, distances and speeds are illustrative.
 */
import * as THREE from 'three'

export const SUN_POS_EARTH_VIEW = new THREE.Vector3(-3.7, 1.5, -5)
export const SUN_RADIUS = 0.62
/** Earth's orbit in the solar view (ecliptic = scene XZ plane). */
export const EARTH_ORBIT_RADIUS = 2.75
/** Illustrative: one year in 40 s (Earth view day = 48 s, SPHEREx orbit = 24 s; none to scale). */
export const EARTH_YEAR_SECONDS = 40
export const TRANSITION_SECONDS = 1.6
/** Where Earth joins its orbit: right of the Sun, slightly towards the camera. */
export const EARTH_START_ANGLE = 0.35

const CAMERA_EARTH = new THREE.Vector3(0, 0, 4.6)
const CAMERA_SOLAR = new THREE.Vector3(0, 2.7, 7.4)

export interface Layout {
  sunPos: THREE.Vector3
  sunScale: number
  earthPos: THREE.Vector3
  earthScale: number
  /** Extra size for the SPHEREx model so it stays visible when Earth is drawn small. */
  craftBoost: number
  camera: THREE.Vector3
  /** 0 → 1: how visible Earth's orbit path and the solar-view labels are. */
  solar: number
}

export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export function earthOrbitPosition(angle: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.cos(angle) * EARTH_ORBIT_RADIUS, 0, Math.sin(angle) * EARTH_ORBIT_RADIUS)
}

/**
 * @param t transition progress 0 (Earth view) … 1 (solar view), already eased
 * @param earthAngle Earth's angle on its orbit around the Sun
 */
export function layout(t: number, earthAngle: number, out?: Layout): Layout {
  const o: Layout = out ?? {
    sunPos: new THREE.Vector3(),
    sunScale: 1,
    earthPos: new THREE.Vector3(),
    earthScale: 1,
    craftBoost: 1,
    camera: new THREE.Vector3(),
    solar: 0,
  }
  o.sunPos.copy(SUN_POS_EARTH_VIEW).multiplyScalar(1 - t)
  o.sunScale = 1 + 0.6 * t
  earthOrbitPosition(earthAngle, o.earthPos).multiplyScalar(t)
  o.earthScale = 1 - 0.58 * t
  o.craftBoost = 1 + 1.3 * t
  o.camera.lerpVectors(CAMERA_EARTH, CAMERA_SOLAR, t)
  o.solar = t
  return o
}

/** Direction of sunlight as seen from Earth: the fixed scene light in Earth view, the real Sun otherwise. */
export function sunlightDirection(t: number, l: Layout, earthViewLight: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  const toSun = new THREE.Vector3().subVectors(l.sunPos, l.earthPos)
  if (toSun.lengthSq() < 1e-9) return out.copy(earthViewLight)
  toSun.normalize()
  return out.lerpVectors(earthViewLight, toSun, t).normalize()
}
