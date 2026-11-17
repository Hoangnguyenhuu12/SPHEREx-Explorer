// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { describe, expect, it, vi } from 'vitest'
import { SpherexCraft } from '../features/artwork/SpherexCraft'
import { buildSpherexObservatory, disposeSpherexObservatory } from '../features/artwork/spherexModel'

describe('SPHEREx 3D observatory model', () => {
  it('builds all required named structural groups and updated PBR materials', () => {
    const root = buildSpherexObservatory()
    expect(root.name).toBe('SPHEREx_Observatory')

    const requiredGroups = ['Photon_Shields', 'Telescope_Payload', 'Spacecraft_Bus', 'Solar_Array', 'Base_Ring']
    for (const groupName of requiredGroups) {
      expect(root.getObjectByName(groupName)).toBeTruthy()
    }

    // Three nested faceted polygonal photon shields: matte white outer + brushed anisotropic aluminum inner
    const shields = ['Photon_Shield_Inner', 'Photon_Shield_Middle', 'Photon_Shield_Outer']
    for (const shieldName of shields) {
      const exterior = root.getObjectByName(`${shieldName}_Exterior`) as THREE.Mesh | undefined
      const interior = root.getObjectByName(`${shieldName}_Interior`) as THREE.Mesh | undefined
      expect(exterior).toBeInstanceOf(THREE.Mesh)
      expect(interior).toBeInstanceOf(THREE.Mesh)
      expect(exterior!.geometry.getAttribute('position').count).toBe(36)
      expect(exterior!.geometry.getAttribute('uv')).toBeTruthy()

      const extMat = exterior!.material as THREE.MeshStandardMaterial
      expect(extMat.name).toBe('Shield_Thermal_Matte_White')
      expect(extMat.roughness).toBeGreaterThanOrEqual(0.8)
      expect(extMat.aoMap).toBeTruthy()
      expect(exterior!.geometry.getAttribute('uv1')).toBeTruthy()

      const intMat = interior!.material as THREE.MeshPhysicalMaterial
      expect(intMat.name).toBe('Shield_Interior_Brushed_Aluminum')
      expect(intMat.anisotropy).toBeGreaterThan(0.8)
      expect(intMat.metalness).toBeGreaterThan(0.85)
      expect(intMat.map).toBeTruthy()
      expect(intMat.aoMapIntensity).toBeGreaterThan(1.5)
      expect(interior!.castShadow).toBe(true)
    }

    // White & silver/grey metallic spacecraft bus (no yellow/gold)
    const bus = root.getObjectByName('Bus_Hex_Body') as THREE.Mesh | undefined
    expect(bus).toBeInstanceOf(THREE.Mesh)
    expect((bus!.material as THREE.Material).name).toBe('Bus_Thermal_White')
    expect((root.getObjectByName('Bus_Silver_Panel_1') as THREE.Mesh).material).toMatchObject({
      name: 'Bus_Silver_Metallic',
    })

    // Glossy glass-like deep blue/black solar panel with metallic support arms
    const solar = root.getObjectByName('Solar_Cells_Plate') as THREE.Mesh | undefined
    expect(solar).toBeInstanceOf(THREE.Mesh)
    const solarMat = solar!.material as THREE.MeshPhysicalMaterial
    expect(solarMat.name).toBe('Solar_Cells_Glass_Coat')
    expect(solarMat.clearcoat).toBe(1)
    expect(solarMat.map).toBeTruthy()
    const arm = root.getObjectByName('Solar_Bracket_1') as THREE.Mesh | undefined
    expect((arm!.material as THREE.MeshStandardMaterial).metalness).toBeGreaterThan(0.85)

    // Central telescope glowing cyan circular lens cover + thin white tripod strut
    const lens = root.getObjectByName('Telescope_Optics_Lens') as THREE.Mesh | undefined
    expect(lens).toBeInstanceOf(THREE.Mesh)
    expect((lens!.material as THREE.MeshStandardMaterial).name).toBe('Telescope_Lens_Cyan_Glow')
    expect((lens!.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(1)

    for (let k = 1; k <= 3; k++) {
      const strut = root.getObjectByName(`Tripod_Strut_${k}`) as THREE.Mesh | undefined
      expect(strut).toBeInstanceOf(THREE.Mesh)
      expect((strut!.material as THREE.Material).name).toBe('Tripod_Strut_Matte_White')
      expect(root.getObjectByName(`Bipod_Strut_${k}_1`)).toBeInstanceOf(THREE.Mesh)
      expect(root.getObjectByName(`Bipod_Strut_${k}_2`)).toBeInstanceOf(THREE.Mesh)
    }

    expect(root.getObjectByName('Base_Adapter_Cone')).toBeInstanceOf(THREE.Mesh)
    disposeSpherexObservatory(root)
  })

  it('exports valid glTF 2.0 scene graph with embedded anisotropy and clearcoat extensions', async () => {
    const origGetContext = HTMLCanvasElement.prototype.getContext
    const origToBlob = HTMLCanvasElement.prototype.toBlob
    const origImageData = globalThis.ImageData

    globalThis.ImageData = class StubImageData {
      data: Uint8ClampedArray
      width: number
      height: number
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data
        this.width = width
        this.height = height
      }
    } as unknown as typeof ImageData

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '#000000',
      translate: vi.fn(),
      scale: vi.fn(),
      fillRect: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) =>
        new globalThis.ImageData(new Uint8ClampedArray(Math.max(1, w * h * 4)), Math.max(1, w), Math.max(1, h)),
      putImageData: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as RenderingContext)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
      cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }))
    })

    try {
      const root = buildSpherexObservatory()
      const exporter = new GLTFExporter()
      const gltf = (await exporter.parseAsync(root, { binary: false })) as {
        asset?: { version?: string }
        extensionsUsed?: string[]
        meshes?: unknown[]
        materials?: unknown[]
        images?: unknown[]
      }

      expect(gltf.asset?.version).toBe('2.0')
      expect(gltf.extensionsUsed).toContain('KHR_materials_anisotropy')
      expect(gltf.extensionsUsed).toContain('KHR_materials_clearcoat')
      expect(Array.isArray(gltf.meshes) && gltf.meshes.length).toBeGreaterThan(20)
      expect(Array.isArray(gltf.images) && gltf.images.length).toBeGreaterThanOrEqual(4)

      disposeSpherexObservatory(root)
    } finally {
      HTMLCanvasElement.prototype.getContext = origGetContext
      HTMLCanvasElement.prototype.toBlob = origToBlob
      globalThis.ImageData = origImageData
      vi.restoreAllMocks()
    }
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
