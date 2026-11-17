// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { describe, expect, it } from 'vitest'
import { SpherexCraft } from '../features/artwork/SpherexCraft'
import { buildSpherexObservatory, disposeSpherexObservatory } from '../features/artwork/spherexModel'

describe('SPHEREx 3D observatory model', () => {
  it('builds all required named structural groups with clean finite geometry', () => {
    const root = buildSpherexObservatory()
    expect(root.name).toBe('SPHEREx_Observatory')

    const requiredGroups = ['Photon_Shields', 'Telescope_Payload', 'Spacecraft_Bus', 'Solar_Array', 'Base_Ring']
    for (const groupName of requiredGroups) {
      expect(root.getObjectByName(groupName)).toBeTruthy()
    }

    // Three nested faceted polygonal photon shields
    const shields = ['Photon_Shield_Inner', 'Photon_Shield_Middle', 'Photon_Shield_Outer']
    for (const shieldName of shields) {
      const shield = root.getObjectByName(shieldName)
      expect(shield).toBeTruthy()
      const exterior = root.getObjectByName(`${shieldName}_Exterior`) as THREE.Mesh | undefined
      expect(exterior).toBeInstanceOf(THREE.Mesh)
      // 6 hexagonal sides * 2 triangles * 3 vertices = 36 vertices per exterior shield
      expect(exterior!.geometry.getAttribute('position').count).toBe(36)
    }

    // Bipod support struts inside telescope payload
    for (let k = 1; k <= 3; k++) {
      expect(root.getObjectByName(`Bipod_Strut_${k}_1`)).toBeInstanceOf(THREE.Mesh)
      expect(root.getObjectByName(`Bipod_Strut_${k}_2`)).toBeInstanceOf(THREE.Mesh)
    }

    // Telescope aperture, solar panel, and base adapter ring
    expect(root.getObjectByName('Telescope_Barrel')).toBeInstanceOf(THREE.Mesh)
    expect(root.getObjectByName('Telescope_Optics_Lens')).toBeInstanceOf(THREE.Mesh)
    expect(root.getObjectByName('Base_Adapter_Cone')).toBeInstanceOf(THREE.Mesh)
    expect(root.getObjectByName('Solar_Cells_Plate')).toBeInstanceOf(THREE.Mesh)

    // Verify all vertices are finite numbers
    let meshCount = 0
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        meshCount += 1
        const pos = obj.geometry.getAttribute('position')
        expect(pos.count).toBeGreaterThan(0)
        for (let i = 0; i < pos.count * 3; i++) {
          expect(Number.isFinite(pos.array[i])).toBe(true)
        }
      }
    })
    expect(meshCount).toBeGreaterThan(20)

    disposeSpherexObservatory(root)
  })

  it('exports valid glTF 2.0 JSON from the observatory Three.js scene', async () => {
    const root = buildSpherexObservatory()
    const exporter = new GLTFExporter()
    const gltf = (await exporter.parseAsync(root, { binary: false })) as {
      asset?: { version?: string }
      meshes?: unknown[]
      materials?: unknown[]
    }

    expect(gltf.asset?.version).toBe('2.0')
    expect(Array.isArray(gltf.meshes) && gltf.meshes.length).toBeGreaterThan(20)
    expect(Array.isArray(gltf.materials) && gltf.materials.length).toBeGreaterThanOrEqual(5)

    disposeSpherexObservatory(root)
  })

  it('renders the accessible SVG fallback cleanly when svgOnly is set', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const reactRoot = createRoot(host)

    act(() => {
      reactRoot.render(createElement(SpherexCraft, { svgOnly: true }))
    })

    const svg = host.querySelector('svg[aria-label="Illustration of the SPHEREx space telescope"]')
    expect(svg).toBeTruthy()

    act(() => {
      reactRoot.unmount()
    })
    host.remove()
  })
})
