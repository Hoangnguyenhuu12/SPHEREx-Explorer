/**
 * SPHEREx orbit geometry for the Where-are-you scene (docs/ui-design/SPHEREX_SATELLITE_RESEARCH.md).
 *
 * Verified facts used here:
 * - sun-synchronous, near-polar orbit, inclination 97.951° (arXiv:2511.02985, Table 1)
 * - mean local time of ascending node 06:00, so the orbit rides the day–night line (same table; JPL press kit)
 * - photon-shield cone always points away from Earth; the single solar panel faces the Sun (JPL press kit)
 *
 * Scene convention: Earth spins about +Y (counter-clockwise seen from +Y, matching EarthScene's
 * `rotation.y += …`). Pure functions, no rendering.
 */
import * as THREE from 'three'

export const INCLINATION_DEG = 97.951
/** Real altitude ≈ 659 km = 0.103 Earth radii; drawn slightly higher so the enlarged craft clears the surface. */
export const ORBIT_RADIUS = 1.16
/** Real period ≈ 98 min (≈ 14.7 orbits per Earth turn). Illustrative: two orbits per 48 s Earth turn. */
export const ORBIT_SECONDS = 24

const Y = new THREE.Vector3(0, 1, 0)

export interface OrbitFrame {
  /** Unit vector to the ascending node (on the equator, at the dawn side of the day–night line). */
  u: THREE.Vector3
  /** Unit vector 90° along the orbit from the node; the craft moves from u towards v. */
  v: THREE.Vector3
  /** Orbit normal (angular momentum direction). */
  normal: THREE.Vector3
}

/**
 * Orbit plane for a given light direction: the ascending node sits where the equator meets the
 * dawn terminator (local time 06:00), and the plane is tilted to the requested inclination.
 */
export function orbitFrame(lightDir: THREE.Vector3, inclinationDeg = INCLINATION_DEG): OrbitFrame {
  const h = new THREE.Vector3(lightDir.x, 0, lightDir.z)
  if (h.lengthSq() < 1e-9) h.set(1, 0, 0)
  h.normalize()
  // Points on the equator move along Y × p; the dawn point is the one moving into the light.
  const u = new THREE.Vector3().crossVectors(h, Y).normalize()
  const i = THREE.MathUtils.degToRad(inclinationDeg)
  let best: OrbitFrame | null = null
  for (const sign of [1, -1]) {
    const normal = new THREE.Vector3().copy(Y).multiplyScalar(Math.cos(i)).addScaledVector(h, sign * Math.sin(i)).normalize()
    const v = new THREE.Vector3().crossVectors(normal, u).normalize()
    // Ascending node: the craft must be heading north (+Y) when it crosses u.
    if (v.y > 0) best = { u, v, normal }
  }
  return best!
}

export function orbitPosition(frame: OrbitFrame, angle: number, radius = ORBIT_RADIUS, out = new THREE.Vector3()): THREE.Vector3 {
  return out
    .copy(frame.u)
    .multiplyScalar(Math.cos(angle) * radius)
    .addScaledVector(frame.v, Math.sin(angle) * radius)
}

/**
 * Attitude: model +Y (cone axis) points radially away from Earth, model +Z (solar panel normal)
 * points as close to the Sun as the cone axis allows. Returns a rotation matrix.
 */
export function attitude(position: THREE.Vector3, lightDir: THREE.Vector3, out = new THREE.Matrix4()): THREE.Matrix4 {
  const up = position.clone().normalize()
  const toward = lightDir.clone().addScaledVector(up, -lightDir.dot(up))
  if (toward.lengthSq() < 1e-9) toward.copy(Math.abs(up.y) < 0.9 ? Y : new THREE.Vector3(1, 0, 0)).addScaledVector(up, -up.dot(Y))
  toward.normalize()
  const right = new THREE.Vector3().crossVectors(up, toward).normalize()
  return out.makeBasis(right, up, toward)
}

/**
 * Sun-synchronous behaviour: as Earth moves around the Sun, the orbit plane turns about Earth's
 * axis so it keeps the same angle to the Sun (nodes stay at 06:00/18:00 local time). The plane
 * depends only on the horizontal part of the sunlight, so the turn is a rotation about +Y taking the
 * reference sun direction onto the current one.
 */
export function alignToSun(referenceLight: THREE.Vector3, light: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
  const a = new THREE.Vector3(referenceLight.x, 0, referenceLight.z)
  const b = new THREE.Vector3(light.x, 0, light.z)
  if (a.lengthSq() < 1e-9 || b.lengthSq() < 1e-9) return out.identity()
  const angle = Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x)
  return out.setFromAxisAngle(Y, angle)
}

/** True when a sphere of `radius` at the origin blocks the line from the camera to the point. */
export function isOccluded(camera: THREE.Vector3, point: THREE.Vector3, radius = 1): boolean {
  const d = point.clone().sub(camera)
  const len = d.length()
  if (len < 1e-9) return false
  d.divideScalar(len)
  const b = camera.dot(d)
  const c = camera.lengthSq() - radius * radius
  const disc = b * b - c
  if (disc < 0) return false
  const t = -b - Math.sqrt(disc)
  return t > 0 && t < len - 1e-6
}

/** Angle on the orbit where the craft is best seen from the camera (front, slightly high). */
export function bestViewAngle(frame: OrbitFrame, cameraDir = new THREE.Vector3(0, 0, 1), steps = 360): number {
  let best = 0
  let score = -Infinity
  const p = new THREE.Vector3()
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 2
    orbitPosition(frame, a, 1, p)
    const s = p.dot(cameraDir) + 0.5 * p.y
    if (s > score) {
      score = s
      best = a
    }
  }
  return best
}
