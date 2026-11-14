import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { EARTH_ORBIT_RADIUS, easeInOut, layout, SUN_POS_EARTH_VIEW, sunlightDirection } from '../features/earth-scene/solarView'
import { alignToSun, INCLINATION_DEG, orbitFrame } from '../features/earth-scene/spherexOrbit'

const sceneLight = new THREE.Vector3(-3.7, 1.5, 3).normalize()

describe('solar view layout', () => {
  it('starts from the Earth view unchanged', () => {
    const l = layout(0, 1.2)
    expect(l.sunPos.equals(SUN_POS_EARTH_VIEW)).toBe(true)
    expect(l.earthPos.length()).toBe(0)
    expect(l.earthScale).toBe(1)
    expect(l.camera.toArray()).toEqual([0, 0, 4.6])
  })
  it('ends with the Sun at the centre and Earth on its orbit, smaller', () => {
    const l = layout(1, 0.35)
    expect(l.sunPos.length()).toBeCloseTo(0, 9)
    expect(l.earthPos.length()).toBeCloseTo(EARTH_ORBIT_RADIUS, 9)
    expect(l.earthPos.y).toBe(0)
    expect(l.earthScale).toBeLessThan(0.5)
    expect(l.sunScale).toBeGreaterThan(1)
  })
  it('eases smoothly from 0 to 1', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 9)
    expect(easeInOut(-1)).toBe(0)
  })
  it('lights Earth from the Sun in the solar view', () => {
    const l = layout(1, 2)
    const d = sunlightDirection(1, l, sceneLight)
    const toSun = l.sunPos.clone().sub(l.earthPos).normalize()
    expect(d.dot(toSun)).toBeCloseTo(1, 9)
    expect(sunlightDirection(0, layout(0, 2), sceneLight).dot(sceneLight)).toBeCloseTo(1, 9)
  })
})

describe('sun-synchronous orbit around the year', () => {
  it('keeps the SPHEREx orbit at the same angle to the Sun wherever Earth is', () => {
    const base = orbitFrame(sceneLight)
    const q = new THREE.Quaternion()
    for (let k = 0; k < 12; k++) {
      const l = layout(1, (k / 12) * Math.PI * 2)
      const light = sunlightDirection(1, l, sceneLight)
      alignToSun(sceneLight, light, q)
      const normal = base.normal.clone().applyQuaternion(q)
      const node = base.u.clone().applyQuaternion(q)
      const h = new THREE.Vector3(light.x, 0, light.z).normalize()
      // Inclination is unchanged by the turn…
      expect(THREE.MathUtils.radToDeg(normal.angleTo(new THREE.Vector3(0, 1, 0)))).toBeCloseTo(INCLINATION_DEG, 3)
      // …and the node line stays on the day–night line (perpendicular to the sunlight), at dawn.
      expect(node.dot(h)).toBeCloseTo(0, 9)
      expect(new THREE.Vector3(0, 1, 0).cross(node).dot(h)).toBeCloseTo(1, 6)
    }
  })
})
