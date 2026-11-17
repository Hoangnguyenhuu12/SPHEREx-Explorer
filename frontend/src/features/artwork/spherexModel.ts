import * as THREE from 'three'

/**
 * Generates a tileable circumferential brushed tin/aluminum DataTexture pair (albedo + roughness + bump)
 * for anisotropic metallic inner surfaces inside the photon shields.
 */
function createBrushedAluminumTextures(): {
  map: THREE.DataTexture
  roughnessMap: THREE.DataTexture
  bumpMap: THREE.DataTexture
} {
  const size = 256
  const albedo = new Uint8Array(size * size * 4)
  const rough = new Uint8Array(size * size * 4)
  const bump = new Uint8Array(size * size * 4)

  // Deterministic pseudo-random per scanline so circumferential horizontal brush streaks look crisp and consistent.
  const rowBias = new Float32Array(size)
  let seed = 1337
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }
  for (let y = 0; y < size; y++) {
    rowBias[y] = (nextRand() - 0.5) * 34 + Math.sin(y * 1.15) * 12
  }

  for (let y = 0; y < size; y++) {
    const bias = rowBias[y]
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      const fine = Math.sin((x / size) * Math.PI * 6 + y * 0.31) * 5 + (nextRand() - 0.5) * 6
      const val = Math.max(52, Math.min(132, Math.round(88 + bias + fine)))
      albedo[idx] = Math.max(0, val - 6)
      albedo[idx + 1] = val
      albedo[idx + 2] = Math.min(255, val + 16)
      albedo[idx + 3] = 255

      const rVal = Math.max(52, Math.min(118, Math.round(78 - bias * 0.65 + (nextRand() - 0.5) * 14)))
      rough[idx] = rVal
      rough[idx + 1] = rVal
      rough[idx + 2] = rVal
      rough[idx + 3] = 255

      const bVal = Math.max(60, Math.min(200, Math.round(128 + bias * 1.4)))
      bump[idx] = bVal
      bump[idx + 1] = bVal
      bump[idx + 2] = bVal
      bump[idx + 3] = 255
    }
  }

  const makeTex = (data: Uint8Array, srgb: boolean) => {
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(3, 2)
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.generateMipmaps = true
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    tex.needsUpdate = true
    return tex
  }

  return {
    map: makeTex(albedo, true),
    roughnessMap: makeTex(rough, false),
    bumpMap: makeTex(bump, false),
  }
}

/** Generates a baked deep blue/black monocrystalline solar-cell wafer grid DataTexture. */
function createSolarCellTextures(): { map: THREE.DataTexture; roughnessMap: THREE.DataTexture } {
  const w = 512
  const h = 256
  const albedo = new Uint8Array(w * h * 4)
  const rough = new Uint8Array(w * h * 4)

  const cols = 8
  const rows = 4
  const cellW = w / cols
  const cellH = h / rows

  for (let y = 0; y < h; y++) {
    const ry = y % cellH
    const ny = ry / cellH
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const cx = x % cellW
      const nx = cx / cellW

      const borderX = nx < 0.045 || nx > 0.955
      const borderY = ny < 0.06 || ny > 0.94
      const cornerChamfer =
        Math.min(nx, 1 - nx) + Math.min(ny, 1 - ny) < 0.16

      const busbar = Math.abs(nx - 0.5) < 0.015 || Math.abs(nx - 0.25) < 0.008 || Math.abs(nx - 0.75) < 0.008
      const microFinger = Math.round(ny * 20) % 2 === 0 && Math.abs((ny * 20) % 1 - 0.5) < 0.14

      if (borderX || borderY || cornerChamfer) {
        // Dark encapsulated silicon gap / seam
        albedo[idx] = 6
        albedo[idx + 1] = 10
        albedo[idx + 2] = 18
        albedo[idx + 3] = 255
        rough[idx] = rough[idx + 1] = rough[idx + 2] = 44
        rough[idx + 3] = 255
      } else if (busbar) {
        // Fine silver metallic photovoltaic busbar
        albedo[idx] = 135
        albedo[idx + 1] = 165
        albedo[idx + 2] = 204
        albedo[idx + 3] = 255
        rough[idx] = rough[idx + 1] = rough[idx + 2] = 28
        rough[idx + 3] = 255
      } else {
        // Deep blue-black silicon wafer with subtle cell sheen variation
        const sheen = microFinger ? 1.16 : 1.0
        albedo[idx] = Math.min(255, Math.round(10 * sheen))
        albedo[idx + 1] = Math.min(255, Math.round(30 * sheen))
        albedo[idx + 2] = Math.min(255, Math.round(74 * sheen))
        albedo[idx + 3] = 255
        rough[idx] = rough[idx + 1] = rough[idx + 2] = 22
        rough[idx + 3] = 255
      }
    }
  }

  const makeTex = (data: Uint8Array, srgb: boolean) => {
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.generateMipmaps = true
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    tex.needsUpdate = true
    return tex
  }

  return {
    map: makeTex(albedo, true),
    roughnessMap: makeTex(rough, false),
  }
}

/** Generates a radial glowing light-blue/cyan lens cover DataTexture for the central telescope. */
function createCyanLensTexture(): THREE.DataTexture {
  const size = 256
  const data = new Uint8Array(size * size * 4)
  const half = (size - 1) / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      const dx = (x - half) / half
      const dy = (y - half) / half
      const r = Math.min(1, Math.hypot(dx, dy))
      // Crisp bright cyan core + concentric anti-reflective coating ring near rim
      const core = Math.pow(1 - r, 1.35)
      const ring = Math.exp(-Math.pow((r - 0.78) / 0.08, 2)) * 0.45
      const t = Math.min(1, core + ring)

      data[idx] = Math.round(52 + 168 * t)
      data[idx + 1] = Math.round(178 + 72 * t)
      data[idx + 2] = Math.round(235 + 20 * t)
      data[idx + 3] = 255
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Generates a gentle vertical crevice Ambient Occlusion ramp DataTexture (v=0 soft crevice -> v=1 open sky) without crushing shadows black. */
function createCreviceAoTexture(): THREE.DataTexture {
  const w = 16
  const h = 256
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1)
    const occ = Math.pow(v, 0.72)
    // Floor stays around ~0.55 so recessed aluminum & white faces retain clean 3D depth without turning black
    const lum = Math.max(140, Math.min(255, Math.round(140 + 115 * occ)))
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      data[idx] = lum
      data[idx + 1] = lum
      data[idx + 2] = lum
      data[idx + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

/** Copies or remaps a geometry's vertical UV into `uv1` for crevice Ambient Occlusion sampling. */
function applyAoUv(geo: THREE.BufferGeometry, vMin = 0, vMax = 1): void {
  const uv = geo.getAttribute('uv')
  if (!uv) return
  const out = new Float32Array(uv.count * 2)
  for (let i = 0; i < uv.count; i++) {
    out[i * 2] = uv.getX(i)
    out[i * 2 + 1] = THREE.MathUtils.lerp(vMin, vMax, uv.getY(i))
  }
  geo.setAttribute('uv1', new THREE.BufferAttribute(out, 2))
}

/**
 * Builds an explicit double-walled faceted polygonal frustum (hexagonal shield stage)
 * with UVs on exterior, interior (circumferential brushed metallic grain), and solid rims,
 * plus `uv1` crevice AO coordinates calibrated per nested stage.
 */
function createPolygonalShieldGeometries(
  sides: number,
  rBottom: number,
  rTop: number,
  yBottom: number,
  yTop: number,
  thickness: number,
  outerAoRange: readonly [number, number] = [0.42, 1.0],
  innerAoRange: readonly [number, number] = [0.02, 0.94],
): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry; rim: THREE.BufferGeometry } {
  const outerPos: number[] = []
  const outerUv: number[] = []
  const innerPos: number[] = []
  const innerUv: number[] = []
  const rimPos: number[] = []
  const rimUv: number[] = []

  const pushTri = (arr: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }

  const pushQuad = (
    posArr: number[],
    uvArr: number[],
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    u0: number,
    u1: number,
    v0: number,
    v1: number,
  ) => {
    pushTri(posArr, a, b, c)
    uvArr.push(u0, v0, u1, v0, u1, v1)
    pushTri(posArr, a, c, d)
    uvArr.push(u0, v0, u1, v1, u0, v1)
  }

  const angleOffset = Math.PI / sides

  for (let i = 0; i < sides; i++) {
    const u0 = i / sides
    const u1 = (i + 1) / sides
    const a0 = angleOffset + u0 * Math.PI * 2
    const a1 = angleOffset + u1 * Math.PI * 2

    const c0 = Math.cos(a0)
    const s0 = Math.sin(a0)
    const c1 = Math.cos(a1)
    const s1 = Math.sin(a1)

    const ob0 = new THREE.Vector3(c0 * rBottom, yBottom, s0 * rBottom)
    const ob1 = new THREE.Vector3(c1 * rBottom, yBottom, s1 * rBottom)
    const ot0 = new THREE.Vector3(c0 * rTop, yTop, s0 * rTop)
    const ot1 = new THREE.Vector3(c1 * rTop, yTop, s1 * rTop)

    const ib0 = new THREE.Vector3(c0 * (rBottom - thickness), yBottom, s0 * (rBottom - thickness))
    const ib1 = new THREE.Vector3(c1 * (rBottom - thickness), yBottom, s1 * (rBottom - thickness))
    const it0 = new THREE.Vector3(c0 * (rTop - thickness), yTop, s0 * (rTop - thickness))
    const it1 = new THREE.Vector3(c1 * (rTop - thickness), yTop, s1 * (rTop - thickness))

    // Exterior sloped face (outward winding)
    pushQuad(outerPos, outerUv, ob1, ob0, ot0, ot1, u1, u0, 0, 1)
    // Interior sloped face (inward winding; u maps circumferentially for brushed anisotropic grain)
    pushQuad(innerPos, innerUv, ib0, ib1, it1, it0, u0, u1, 0, 1)
    // Top & bottom solid rim lips
    pushQuad(rimPos, rimUv, it0, it1, ot1, ot0, u0, u1, 0, 1)
    pushQuad(rimPos, rimUv, ob0, ob1, ib1, ib0, u0, u1, 0, 1)
  }

  const finalize = (pos: number[], uv: number[], aoRange: readonly [number, number]) => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    applyAoUv(geo, aoRange[0], aoRange[1])
    geo.computeVertexNormals()
    return geo
  }

  return {
    outer: finalize(outerPos, outerUv, outerAoRange),
    inner: finalize(innerPos, innerUv, innerAoRange),
    rim: finalize(rimPos, rimUv, [0.85, 1.0]),
  }
}

/** Creates a cylindrical strut connecting two 3D points cleanly. */
function makeStrut(p0: THREE.Vector3, p1: THREE.Vector3, radius: number, material: THREE.Material, name: string): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(p1, p0)
  const len = dir.length()
  const geo = new THREE.CylinderGeometry(radius, radius, len, 12)
  const mesh = new THREE.Mesh(geo, material)
  mesh.name = name
  mesh.position.addVectors(p0, p1).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return mesh
}

/**
 * Builds the SPHEREx space observatory with baked PBR materials (matte white outer thermal shields,
 * anisotropic brushed aluminum shield interiors, white & silver/grey metallic hexagonal bus,
 * glossy glass-coated deep blue/black solar cells with metallic arms, and glowing cyan lens under
 * a thin white tripod strut). Ready for WebGL 360-degree rendering and binary .GLB export.
 */
export function buildSpherexObservatory(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'SPHEREx_Observatory'

  const brushedTex = createBrushedAluminumTextures()
  const solarTex = createSolarCellTextures()
  const lensTex = createCyanLensTexture()
  const creviceAoTex = createCreviceAoTexture()

  // Photon Shields: Matte white thermal coating outside, brushed aluminum interior with subtle anisotropic highlights
  const shieldOuterMat = new THREE.MeshStandardMaterial({
    name: 'Shield_Thermal_Matte_White',
    color: '#f4f6fa',
    aoMap: creviceAoTex,
    aoMapIntensity: 0.65,
    metalness: 0.04,
    roughness: 0.86,
    flatShading: true,
  })
  const shieldInnerMat = new THREE.MeshPhysicalMaterial({
    name: 'Shield_Interior_Brushed_Aluminum',
    color: '#4a556e',
    map: brushedTex.map,
    roughnessMap: brushedTex.roughnessMap,
    bumpMap: brushedTex.bumpMap,
    bumpScale: 0.008,
    aoMap: creviceAoTex,
    aoMapIntensity: 1.5,
    metalness: 0.78,
    roughness: 0.34,
    anisotropy: 0.88,
    anisotropyRotation: 0,
    envMapIntensity: 0.95,
    flatShading: true,
  })
  const shieldRimMat = new THREE.MeshStandardMaterial({
    name: 'Shield_Rim_White_Aluminum',
    color: '#ffffff',
    aoMap: creviceAoTex,
    aoMapIntensity: 0.25,
    metalness: 0.12,
    roughness: 0.48,
    flatShading: true,
  })

  // Spacecraft Bus: White thermal coating + clean silver/light-grey metallic panels (no black/dark washout)
  const busWhiteMat = new THREE.MeshStandardMaterial({
    name: 'Bus_Thermal_White',
    color: '#f1f4f9',
    aoMap: creviceAoTex,
    aoMapIntensity: 0.55,
    metalness: 0.05,
    roughness: 0.78,
    flatShading: true,
  })
  const silverMetallicMat = new THREE.MeshStandardMaterial({
    name: 'Bus_Silver_Metallic',
    color: '#cdd5e0',
    aoMap: creviceAoTex,
    aoMapIntensity: 0.6,
    metalness: 0.76,
    roughness: 0.3,
    envMapIntensity: 1.2,
    flatShading: true,
  })
  const greyMetallicMat = new THREE.MeshStandardMaterial({
    name: 'Bus_Grey_Metallic',
    color: '#8892a3',
    aoMap: creviceAoTex,
    aoMapIntensity: 0.65,
    metalness: 0.68,
    roughness: 0.36,
    envMapIntensity: 1.1,
  })
  const metallicArmMat = new THREE.MeshStandardMaterial({
    name: 'Solar_Support_Metallic',
    color: '#d4dce6',
    metalness: 0.86,
    roughness: 0.25,
    envMapIntensity: 1.25,
  })

  // Central Telescope: Matte white thin tripod strut + luminous cyan circular lens cover (clear without blowing out)
  const tripodWhiteMat = new THREE.MeshStandardMaterial({
    name: 'Tripod_Strut_Matte_White',
    color: '#f8fafc',
    metalness: 0.06,
    roughness: 0.56,
  })
  const opticsCyanMat = new THREE.MeshStandardMaterial({
    name: 'Telescope_Lens_Cyan_Glow',
    color: '#7dd3fc',
    map: lensTex,
    emissive: '#38bdf8',
    emissiveMap: lensTex,
    emissiveIntensity: 0.95,
    metalness: 0.12,
    roughness: 0.2,
  })

  // Solar Array: Deep blue/black solar cells with glossy, glass-like clearcoat reflection
  const solarCellMat = new THREE.MeshPhysicalMaterial({
    name: 'Solar_Cells_Glass_Coat',
    color: '#ffffff',
    map: solarTex.map,
    roughnessMap: solarTex.roughnessMap,
    metalness: 0.24,
    roughness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    ior: 1.52,
    reflectivity: 0.95,
    envMapIntensity: 1.8,
  })

  // 1. Base Ring: Conical metallic adapter ring at the very bottom + launch mounting flange
  const baseGroup = new THREE.Group()
  baseGroup.name = 'Base_Ring'

  const adapterRing = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 0.22, 18, 1, false), silverMetallicMat)
  adapterRing.name = 'Base_Adapter_Cone'
  adapterRing.position.y = 0.13
  baseGroup.add(adapterRing)

  const bottomFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.59, 0.59, 0.04, 18), greyMetallicMat)
  bottomFlange.name = 'Base_Mounting_Flange'
  bottomFlange.position.y = 0.02
  baseGroup.add(bottomFlange)

  for (const [idx, zOff] of [
    [1, -0.28],
    [2, 0.28],
  ] as const) {
    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.12, 12), silverMetallicMat)
    dish.name = `Bottom_Antenna_${idx}`
    dish.position.set(0, -0.02, zOff)
    dish.rotation.x = Math.PI
    baseGroup.add(dish)
  }
  root.add(baseGroup)

  // 2. Spacecraft Bus: Hexagonal white & silver/grey metallic base beneath the shields
  const busGroup = new THREE.Group()
  busGroup.name = 'Spacecraft_Bus'

  const busBody = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.62, 0.66, 6), busWhiteMat)
  busBody.name = 'Bus_Hex_Body'
  busBody.position.y = 0.57
  busBody.rotation.y = Math.PI / 6
  busGroup.add(busBody)

  // Flush silver/grey metallic panel plates aligned precisely to alternating flat hexagonal faces (0°, 120°, 240°)
  for (const [idx, angle] of [
    [1, 0],
    [2, (Math.PI * 2) / 3],
    [3, (Math.PI * 4) / 3],
  ] as const) {
    const bayPanel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.44, 0.036), silverMetallicMat)
    bayPanel.name = `Bus_Silver_Panel_${idx}`
    const r = 0.566
    bayPanel.position.set(Math.sin(angle) * r, 0.57, Math.cos(angle) * r)
    bayPanel.rotation.y = angle
    busGroup.add(bayPanel)
  }

  const busTopPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 6), silverMetallicMat)
  busTopPlate.name = 'Bus_Top_Deck'
  busTopPlate.position.y = 0.91
  busTopPlate.rotation.y = Math.PI / 6
  busGroup.add(busTopPlate)

  const busBottomCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.58, 0.06, 6), greyMetallicMat)
  busBottomCollar.name = 'Bus_Bottom_Collar'
  busBottomCollar.position.y = 0.25
  busBottomCollar.rotation.y = Math.PI / 6
  busGroup.add(busBottomCollar)

  // Flush avionics housing mounted squarely on the +60° flat hexagonal face (normal = [sin(60°), cos(60°)])
  const avionicsAngle = Math.PI / 3
  const avionicsGroup = new THREE.Group()
  avionicsGroup.position.set(Math.sin(avionicsAngle) * 0.562, 0.57, Math.cos(avionicsAngle) * 0.562)
  avionicsGroup.rotation.y = avionicsAngle

  const avionicsBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.12), greyMetallicMat)
  avionicsBox.name = 'Equipment_Module_Avionics'
  avionicsBox.position.set(0, 0, 0.05)
  avionicsGroup.add(avionicsBox)

  const avionicsPlate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.03), silverMetallicMat)
  avionicsPlate.name = 'Equipment_Radiator_Plate'
  avionicsPlate.position.set(0, 0, 0.115)
  avionicsGroup.add(avionicsPlate)
  busGroup.add(avionicsGroup)

  // Flush secondary metallic telemetry module mounted squarely on the +120° flat face
  const sideAngle = (Math.PI * 2) / 3
  const sideModule = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.09), greyMetallicMat)
  sideModule.name = 'Equipment_Module_Side'
  sideModule.position.set(Math.sin(sideAngle) * 0.59, 0.56, Math.cos(sideAngle) * 0.59)
  sideModule.rotation.y = sideAngle
  busGroup.add(sideModule)

  for (const [idx, zSign] of [
    [1, 1],
    [2, -1],
  ] as const) {
    const tracker = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.042, 0.16, 12), greyMetallicMat)
    tracker.name = `Star_Tracker_${idx}`
    tracker.position.set(0.5, 0.86, 0.24 * zSign)
    tracker.rotation.z = -0.65
    tracker.rotation.x = 0.25 * zSign
    busGroup.add(tracker)
  }

  // Three V-groove radiator cone stages seated cleanly inside the base of the photon shields (never poking through)
  for (const [idx, y, rTop] of [
    [1, 0.96, 0.7],
    [2, 1.01, 0.65],
    [3, 1.06, 0.6],
  ] as const) {
    const vgroove = new THREE.Mesh(new THREE.CylinderGeometry(rTop, 0.48, 0.035, 6, 1, true), silverMetallicMat)
    vgroove.name = `VGroove_Stage_${idx}`
    vgroove.position.y = y
    vgroove.rotation.y = Math.PI / 6
    busGroup.add(vgroove)
  }
  root.add(busGroup)

  // 3. Solar Array: Flat rectangular deep blue/black glass-coated panel with metallic connecting support arms
  const solarGroup = new THREE.Group()
  solarGroup.name = 'Solar_Array'

  const panelW = 1.62
  const panelH = 0.96
  const panelX = -0.92
  const panelY = 0.82

  const solarFrame = new THREE.Mesh(new THREE.BoxGeometry(0.05, panelH, panelW), greyMetallicMat)
  solarFrame.name = 'Solar_Panel_Backing'
  solarFrame.position.set(panelX, panelY, 0)
  solarGroup.add(solarFrame)

  // Glossy photovoltaic wafer plate visible clearly on exterior (-X) face
  const solarCells = new THREE.Mesh(new THREE.BoxGeometry(0.016, panelH - 0.05, panelW - 0.05), solarCellMat)
  solarCells.name = 'Solar_Cells_Plate'
  solarCells.position.set(panelX - 0.025, panelY, 0)
  solarGroup.add(solarCells)

  for (const [name, sy, sz, py, pz] of [
    ['Solar_Trim_Top', 0.028, panelW, panelH / 2 - 0.014, 0],
    ['Solar_Trim_Bottom', 0.028, panelW, -panelH / 2 + 0.014, 0],
    ['Solar_Trim_Left', panelH, 0.028, 0, -panelW / 2 + 0.014],
    ['Solar_Trim_Right', panelH, 0.028, 0, panelW / 2 - 0.014],
  ] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.064, sy, sz), metallicArmMat)
    rail.name = name
    rail.position.set(panelX - 0.004, panelY + py, pz)
    solarGroup.add(rail)
  }

  for (const [idx, zPos] of [
    [1, -0.34],
    [2, 0.34],
  ] as const) {
    solarGroup.add(
      makeStrut(
        new THREE.Vector3(-0.56, 0.6, zPos),
        new THREE.Vector3(panelX + 0.02, 0.6, zPos),
        0.032,
        metallicArmMat,
        `Solar_Bracket_${idx}`,
      ),
    )
    solarGroup.add(
      makeStrut(
        new THREE.Vector3(-0.58, 0.84, zPos),
        new THREE.Vector3(panelX + 0.02, 0.94, zPos),
        0.024,
        metallicArmMat,
        `Solar_Brace_${idx}`,
      ),
    )
  }
  root.add(solarGroup)

  // 4. Telescope Payload: Cylindrical telescope topped with glowing cyan circular lens cover & thin white tripod strut
  const payloadGroup = new THREE.Group()
  payloadGroup.name = 'Telescope_Payload'

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.8, 24), greyMetallicMat)
  barrel.name = 'Telescope_Barrel'
  barrel.position.y = 1.48
  payloadGroup.add(barrel)

  const foreCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.08, 24), silverMetallicMat)
  foreCollar.name = 'Telescope_Fore_Collar'
  foreCollar.position.y = 1.85
  payloadGroup.add(foreCollar)

  const midCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.06, 24), silverMetallicMat)
  midCollar.name = 'Telescope_Mount_Collar'
  midCollar.position.y = 1.34
  payloadGroup.add(midCollar)

  // Glowing light blue / cyan circular lens cover at the top of the cylindrical telescope
  const apertureOptics = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.035, 28), opticsCyanMat)
  apertureOptics.name = 'Telescope_Optics_Lens'
  apertureOptics.position.y = 1.885
  payloadGroup.add(apertureOptics)

  // Thin white tripod strut arching cleanly over the glowing cyan lens cover
  const tripodHub = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.052, 0.045, 16), tripodWhiteMat)
  tripodHub.name = 'Telescope_Tripod_Hub'
  tripodHub.position.y = 2.09
  payloadGroup.add(tripodHub)

  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6
    const pRim = new THREE.Vector3(Math.cos(a) * 0.27, 1.88, Math.sin(a) * 0.27)
    const pTop = new THREE.Vector3(Math.cos(a) * 0.036, 2.09, Math.sin(a) * 0.036)
    payloadGroup.add(makeStrut(pRim, pTop, 0.015, tripodWhiteMat, `Tripod_Strut_${k + 1}`))
  }

  // Three diagonal V-shaped metallic bipod strut pairs anchoring the telescope barrel to the bus deck
  for (let k = 0; k < 3; k++) {
    const baseAngle = (k / 3) * Math.PI * 2 + Math.PI / 6
    const pTop = new THREE.Vector3(Math.cos(baseAngle) * 0.275, 1.35, Math.sin(baseAngle) * 0.275)
    for (const [legIdx, deltaA] of [
      [1, -0.38],
      [2, 0.38],
    ] as const) {
      const aFoot = baseAngle + deltaA
      const pFoot = new THREE.Vector3(Math.cos(aFoot) * 0.56, 0.94, Math.sin(aFoot) * 0.56)
      payloadGroup.add(makeStrut(pFoot, pTop, 0.022, silverMetallicMat, `Bipod_Strut_${k + 1}_${legIdx}`))
    }
  }
  root.add(payloadGroup)

  // 5. Photon Shields: Three nested faceted hexagonal cones (matte white exterior, brushed aluminum anisotropic interior)
  const shieldsGroup = new THREE.Group()
  shieldsGroup.name = 'Photon_Shields'

  const shieldSpecs = [
    {
      name: 'Photon_Shield_Inner',
      rBottom: 0.54,
      rTop: 1.06,
      yBottom: 1.18,
      yTop: 2.48,
      thickness: 0.032,
      outerAo: [0.02, 0.58] as const,
      innerAo: [0.02, 0.88] as const,
    },
    {
      name: 'Photon_Shield_Middle',
      rBottom: 0.64,
      rTop: 1.34,
      yBottom: 1.1,
      yTop: 2.58,
      thickness: 0.032,
      outerAo: [0.04, 0.68] as const,
      innerAo: [0.04, 0.92] as const,
    },
    {
      name: 'Photon_Shield_Outer',
      rBottom: 0.74,
      rTop: 1.64,
      yBottom: 1.0,
      yTop: 2.68,
      thickness: 0.036,
      outerAo: [0.46, 1.0] as const,
      innerAo: [0.06, 0.96] as const,
    },
  ] as const

  for (const spec of shieldSpecs) {
    const stageGroup = new THREE.Group()
    stageGroup.name = spec.name
    const { outer, inner, rim } = createPolygonalShieldGeometries(
      6,
      spec.rBottom,
      spec.rTop,
      spec.yBottom,
      spec.yTop,
      spec.thickness,
      spec.outerAo,
      spec.innerAo,
    )

    const outerMesh = new THREE.Mesh(outer, shieldOuterMat)
    outerMesh.name = `${spec.name}_Exterior`
    const innerMesh = new THREE.Mesh(inner, shieldInnerMat)
    innerMesh.name = `${spec.name}_Interior`
    const rimMesh = new THREE.Mesh(rim, shieldRimMat)
    rimMesh.name = `${spec.name}_Rim`

    stageGroup.add(outerMesh, innerMesh, rimMesh)
    shieldsGroup.add(stageGroup)
  }
  root.add(shieldsGroup)

  // Assign uv1 crevice occlusion on bus/barrel parts and enable real-time shadow casting/receiving
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (!obj.geometry.getAttribute('uv1') && obj.geometry.getAttribute('uv')) {
        if (obj.name.startsWith('VGroove_') || obj.name === 'Bus_Top_Deck') {
          applyAoUv(obj.geometry, 0.14, 0.36)
        } else if (obj.name === 'Telescope_Barrel') {
          applyAoUv(obj.geometry, 0.04, 0.72)
        } else {
          applyAoUv(obj.geometry, 0.55, 1.0)
        }
      }
      const isLens = obj.name === 'Telescope_Optics_Lens'
      obj.castShadow = !isLens
      obj.receiveShadow = !isLens
    }
  })

  return root
}

/** Disposes geometries, materials, and baked textures created by `buildSpherexObservatory`. */
export function disposeSpherexObservatory(root: THREE.Object3D): void {
  const mats = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      const list = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const m of list) {
        if (!m) continue
        mats.add(m)
        const std = m as THREE.MeshStandardMaterial
        if (std.map) textures.add(std.map)
        if (std.roughnessMap) textures.add(std.roughnessMap)
        if (std.bumpMap) textures.add(std.bumpMap)
        if (std.aoMap) textures.add(std.aoMap)
        if (std.emissiveMap) textures.add(std.emissiveMap)
      }
    }
  })
  textures.forEach((t) => t.dispose())
  mats.forEach((m) => m.dispose())
}
