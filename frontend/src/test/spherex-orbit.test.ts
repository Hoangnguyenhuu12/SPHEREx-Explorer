import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { attitude, bestViewAngle, INCLINATION_DEG, isOccluded, orbitFrame, orbitPosition } from '../features/earth-scene/spherexOrbit'

const light = new THREE.Vector3(-3.7, 1.5, 3).normalize()
const frame = orbitFrame(light)
const deg = (rad: number) => THREE.MathUtils.radToDeg(rad)

describe('SPHEREx orbit frame', () => {
  it('has the published inclination (97.951°, retrograde)', () => {
    const inc = deg(frame.normal.angleTo(new THREE.Vector3(0, 1, 0)))
    expect(inc).toBeCloseTo(INCLINATION_DEG, 3)
  })

  it('crosses the equator northbound at the dawn side of the day–night line (LTAN 06:00)', () => {
    expect(frame.u.y).toBeCloseTo(0, 9)
    expect(frame.v.y).toBeGreaterThan(0)
    // Earth spins about +Y, so a surface point moves along Y × p; at dawn it moves into the light.
    const motion = new THREE.Vector3(0, 1, 0).cross(frame.u)
    const h = new THREE.Vector3(light.x, 0, light.z).normalize()
    expect(motion.dot(h)).toBeCloseTo(1, 6)
  })

  it('stays close to the terminator: never more than the 8° inclination offset from it', () => {
    const h = new THREE.Vector3(light.x, 0, light.z).normalize()
    const p = new THREE.Vector3()
    for (let k = 0; k < 72; k++) {
      orbitPosition(frame, (k / 72) * Math.PI * 2, 1, p)
      expect(Math.abs(p.dot(h))).toBeLessThanOrEqual(Math.sin(THREE.MathUtils.degToRad(INCLINATION_DEG - 90)) + 1e-9)
    }
  })

  it('passes near both poles', () => {
    const p = new THREE.Vector3()
    const ys = Array.from({ length: 360 }, (_, k) => orbitPosition(frame, (k / 360) * Math.PI * 2, 1, p).y)
    expect(Math.max(...ys)).toBeGreaterThan(0.99)
    expect(Math.min(...ys)).toBeLessThan(-0.99)
  })
})

describe('SPHEREx attitude', () => {
  it('points the shield cone away from Earth and the solar panel towards the Sun', () => {
    const p = new THREE.Vector3()
    for (let k = 0; k < 12; k++) {
      orbitPosition(frame, (k / 12) * Math.PI * 2, 1.16, p)
      const m = attitude(p, light)
      const up = new THREE.Vector3(0, 1, 0).applyMatrix4(m)
      const panel = new THREE.Vector3(0, 0, 1).applyMatrix4(m)
      expect(up.dot(p.clone().normalize())).toBeCloseTo(1, 6)
      // Sun at least 91° off the cone axis is the real constraint; here the cone axis is radial.
      expect(panel.dot(light)).toBeGreaterThan(0.9)
      expect(m.determinant()).toBeCloseTo(1, 6)
    }
  })
})

describe('occlusion and framing', () => {
  const cam = new THREE.Vector3(0, 0, 4.6)
  it('hides points behind Earth only', () => {
    expect(isOccluded(cam, new THREE.Vector3(0, 0, -1.16))).toBe(true)
    expect(isOccluded(cam, new THREE.Vector3(0, 0, 1.16))).toBe(false)
    expect(isOccluded(cam, new THREE.Vector3(1.16, 0, 0))).toBe(false)
  })
  it('parks the craft on the camera side', () => {
    const p = orbitPosition(frame, bestViewAngle(frame), 1.16)
    expect(p.z).toBeGreaterThan(0)
    expect(isOccluded(cam, p)).toBe(false)
  })
})
