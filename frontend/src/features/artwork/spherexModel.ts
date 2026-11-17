import * as THREE from 'three'

/**
 * Builds an explicit double-walled faceted polygonal frustum (hexagonal shield stage)
 * with outward-facing exterior facets, inward-facing dark baffle facets, and solid top/bottom rims.
 * Using closed manifold geometry keeps normals crisp in both WebGL and external .OBJ/.GLB viewers.
 */
function createPolygonalShieldGeometries(
  sides: number,
  rBottom: number,
  rTop: number,
  yBottom: number,
  yTop: number,
  thickness: number,
): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry; rim: THREE.BufferGeometry } {
  const outerPos: number[] = []
  const innerPos: number[] = []
  const rimPos: number[] = []

  const pushTri = (arr: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }

  const pushQuad = (arr: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    pushTri(arr, a, b, c)
    pushTri(arr, a, c, d)
  }

  // Offset half a sector so flat hexagonal faces align cleanly with the spacecraft bus facets.
  const angleOffset = Math.PI / sides

  for (let i = 0; i < sides; i++) {
    const a0 = angleOffset + (i / sides) * Math.PI * 2
    const a1 = angleOffset + ((i + 1) / sides) * Math.PI * 2

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
    pushQuad(outerPos, ob1, ob0, ot0, ot1)
    // Interior sloped face (inward winding)
    pushQuad(innerPos, ib0, ib1, it1, it0)
    // Top rim lip (upward winding) & bottom lip (downward winding)
    pushQuad(rimPos, it0, it1, ot1, ot0)
    pushQuad(rimPos, ob0, ob1, ib1, ib0)
  }

  const finalize = (arr: number[]) => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    geo.computeVertexNormals()
    return geo
  }

  return {
    outer: finalize(outerPos),
    inner: finalize(innerPos),
    rim: finalize(rimPos),
  }
}

/** Creates a cylindrical strut connecting two 3D points cleanly without gimbal ambiguities. */
function makeStrut(p0: THREE.Vector3, p1: THREE.Vector3, radius: number, material: THREE.Material, name: string): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(p1, p0)
  const len = dir.length()
  const geo = new THREE.CylinderGeometry(radius, radius, len, 10)
  const mesh = new THREE.Mesh(geo, material)
  mesh.name = name
  mesh.position.addVectors(p0, p1).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return mesh
}

/**
 * Creates a clean, named Three.js Group of the SPHEREx space observatory with
 * PBR materials and closed polygonal topology suitable for WebGL, .OBJ/.MTL, and .GLB/.GLTF.
 */
export function buildSpherexObservatory(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'SPHEREx_Observatory'

  // Materials — bright, crisp silver-white aerospace finishes that stay luminous against space black
  const shieldOuterMat = new THREE.MeshStandardMaterial({
    name: 'Shield_Silver_MLI',
    color: '#f5f4ef',
    emissive: '#d8dee9',
    emissiveIntensity: 0.18,
    metalness: 0.16,
    roughness: 0.3,
    flatShading: true,
  })
  const shieldInnerMat = new THREE.MeshStandardMaterial({
    name: 'Baffle_Dark_Cavity',
    color: '#1b2030',
    metalness: 0.2,
    roughness: 0.72,
    flatShading: true,
  })
  const shieldRimMat = new THREE.MeshStandardMaterial({
    name: 'Shield_Trim_Aluminum',
    color: '#ffffff',
    emissive: '#e2e8f0',
    emissiveIntensity: 0.28,
    metalness: 0.25,
    roughness: 0.22,
    flatShading: true,
  })
  const busGoldMat = new THREE.MeshStandardMaterial({
    name: 'Bus_Gold_Kapton',
    color: '#ecc358',
    emissive: '#8a6216',
    emissiveIntensity: 0.2,
    metalness: 0.34,
    roughness: 0.3,
    flatShading: true,
  })
  const darkMetalMat = new THREE.MeshStandardMaterial({
    name: 'Structure_Graphite',
    color: '#394054',
    emissive: '#1e2433',
    emissiveIntensity: 0.14,
    metalness: 0.48,
    roughness: 0.42,
  })
  const titaniumMat = new THREE.MeshStandardMaterial({
    name: 'Strut_Titanium',
    color: '#d4dce8',
    emissive: '#64748b',
    emissiveIntensity: 0.18,
    metalness: 0.38,
    roughness: 0.26,
  })
  const opticsCyanMat = new THREE.MeshStandardMaterial({
    name: 'Telescope_Optics_Blue',
    color: '#38bdf8',
    emissive: '#0ea5e9',
    emissiveIntensity: 1.05,
    metalness: 0.3,
    roughness: 0.14,
  })
  const solarCellMat = new THREE.MeshStandardMaterial({
    name: 'Solar_Cell_Photovoltaic',
    color: '#215ba6',
    emissive: '#0d2b57',
    emissiveIntensity: 0.24,
    metalness: 0.26,
    roughness: 0.22,
  })
  const solarGridMat = new THREE.MeshStandardMaterial({
    name: 'Solar_Frame_Silver',
    color: '#9fd0f5',
    emissive: '#3b82f6',
    emissiveIntensity: 0.14,
    metalness: 0.42,
    roughness: 0.24,
  })

  // 1. Base Ring: conical adapter ring at the very bottom + launch mounting flange
  const baseGroup = new THREE.Group()
  baseGroup.name = 'Base_Ring'

  const adapterRing = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 0.22, 16, 1, false), titaniumMat)
  adapterRing.name = 'Base_Adapter_Cone'
  adapterRing.position.y = 0.13
  baseGroup.add(adapterRing)

  const bottomFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.59, 0.59, 0.04, 16), darkMetalMat)
  bottomFlange.name = 'Base_Mounting_Flange'
  bottomFlange.position.y = 0.02
  baseGroup.add(bottomFlange)

  // Two small underside Ka-band antennas
  for (const [idx, zOff] of [
    [1, -0.28],
    [2, 0.28],
  ] as const) {
    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.12, 12), titaniumMat)
    dish.name = `Bottom_Antenna_${idx}`
    dish.position.set(0, -0.02, zOff)
    dish.rotation.x = Math.PI
    baseGroup.add(dish)
  }
  root.add(baseGroup)

  // 2. Spacecraft Bus: hexagonal base section with equipment modules and metallic trims
  const busGroup = new THREE.Group()
  busGroup.name = 'Spacecraft_Bus'

  const busBody = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.62, 0.66, 6), busGoldMat)
  busBody.name = 'Bus_Hex_Body'
  busBody.position.y = 0.57
  busBody.rotation.y = Math.PI / 6
  busGroup.add(busBody)

  const busTopPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.06, 6), darkMetalMat)
  busTopPlate.name = 'Bus_Top_Deck'
  busTopPlate.position.y = 0.91
  busTopPlate.rotation.y = Math.PI / 6
  busGroup.add(busTopPlate)

  const busBottomCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.58, 0.06, 6), darkMetalMat)
  busBottomCollar.name = 'Bus_Bottom_Collar'
  busBottomCollar.position.y = 0.25
  busBottomCollar.rotation.y = Math.PI / 6
  busGroup.add(busBottomCollar)

  // Avionics equipment module on the opposite side (+X)
  const avionicsBox = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.36, 0.42), darkMetalMat)
  avionicsBox.name = 'Equipment_Module_Avionics'
  avionicsBox.position.set(0.63, 0.58, 0)
  busGroup.add(avionicsBox)

  const avionicsPlate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.34), titaniumMat)
  avionicsPlate.name = 'Equipment_Radiator_Plate'
  avionicsPlate.position.set(0.73, 0.58, 0)
  busGroup.add(avionicsPlate)

  // Side radiator / attitude-control housing on +Z/-Z facets
  const sideModule = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.16), titaniumMat)
  sideModule.name = 'Equipment_Module_Side'
  sideModule.position.set(0.28, 0.56, 0.56)
  sideModule.rotation.y = Math.PI / 6
  busGroup.add(sideModule)

  // Star tracker optical heads angled out from the bus deck
  for (const [idx, zSign] of [
    [1, 1],
    [2, -1],
  ] as const) {
    const tracker = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.18, 10), darkMetalMat)
    tracker.name = `Star_Tracker_${idx}`
    tracker.position.set(0.56, 0.84, 0.26 * zSign)
    tracker.rotation.z = -0.65
    tracker.rotation.x = 0.25 * zSign
    busGroup.add(tracker)
  }

  // Three V-groove radiator cone stages under the main photon shields
  for (const [idx, y, rTop] of [
    [1, 0.97, 0.82],
    [2, 1.04, 0.77],
    [3, 1.11, 0.71],
  ] as const) {
    const vgroove = new THREE.Mesh(new THREE.CylinderGeometry(rTop, 0.48, 0.04, 6, 1, true), shieldRimMat)
    vgroove.name = `VGroove_Stage_${idx}`
    vgroove.position.y = y
    vgroove.rotation.y = Math.PI / 6
    busGroup.add(vgroove)
  }
  root.add(busGroup)

  // 3. Solar Array: flat rectangular solar panel attached vertically to the -X side of the bus
  const solarGroup = new THREE.Group()
  solarGroup.name = 'Solar_Array'

  const panelW = 1.62
  const panelH = 0.96
  const panelX = -0.92
  const panelY = 0.82

  const solarFrame = new THREE.Mesh(new THREE.BoxGeometry(0.055, panelH, panelW), darkMetalMat)
  solarFrame.name = 'Solar_Panel_Backing'
  solarFrame.position.set(panelX, panelY, 0)
  solarGroup.add(solarFrame)

  // Photovoltaic front face (-X exterior facing Sun) and silver cell divider grid bars
  const solarCells = new THREE.Mesh(new THREE.BoxGeometry(0.014, panelH - 0.06, panelW - 0.06), solarCellMat)
  solarCells.name = 'Solar_Cells_Plate'
  solarCells.position.set(panelX - 0.026, panelY, 0)
  solarGroup.add(solarCells)

  // Raised perimeter frame rails + 4x2 grid ribs so cell grid reads crisply in any .OBJ / .GLB viewer
  const barThickness = 0.016
  for (let gx = -1; gx <= 1; gx++) {
    const barV = new THREE.Mesh(new THREE.BoxGeometry(0.018, panelH - 0.05, barThickness), solarGridMat)
    barV.name = `Solar_Grid_V_${gx + 2}`
    barV.position.set(panelX - 0.03, panelY, gx * ((panelW - 0.06) / 4))
    solarGroup.add(barV)
  }
  const barH = new THREE.Mesh(new THREE.BoxGeometry(0.018, barThickness, panelW - 0.05), solarGridMat)
  barH.name = 'Solar_Grid_H'
  barH.position.set(panelX - 0.03, panelY, 0)
  solarGroup.add(barH)

  // Perimeter trim rails (top, bottom, front, back)
  for (const [name, sy, sz, py, pz] of [
    ['Solar_Trim_Top', 0.028, panelW, panelH / 2 - 0.014, 0],
    ['Solar_Trim_Bottom', 0.028, panelW, -panelH / 2 + 0.014, 0],
    ['Solar_Trim_Left', panelH, 0.028, 0, -panelW / 2 + 0.014],
    ['Solar_Trim_Right', panelH, 0.028, 0, panelW / 2 - 0.014],
  ] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.066, sy, sz), solarGridMat)
    rail.name = name
    rail.position.set(panelX - 0.004, panelY + py, pz)
    solarGroup.add(rail)
  }

  // Twin mounting brackets linking the bus side cleanly to the vertical solar array
  for (const [idx, zPos] of [
    [1, -0.34],
    [2, 0.34],
  ] as const) {
    solarGroup.add(
      makeStrut(new THREE.Vector3(-0.56, 0.62, zPos), new THREE.Vector3(panelX + 0.02, 0.62, zPos), 0.032, titaniumMat, `Solar_Bracket_${idx}`),
    )
    solarGroup.add(
      makeStrut(new THREE.Vector3(-0.58, 0.84, zPos), new THREE.Vector3(panelX + 0.02, 0.94, zPos), 0.022, titaniumMat, `Solar_Brace_${idx}`),
    )
  }
  root.add(solarGroup)

  // 4. Telescope Payload: central cylindrical barrel housed deep inside innermost shield + bipod struts
  const payloadGroup = new THREE.Group()
  payloadGroup.name = 'Telescope_Payload'

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.78, 20), darkMetalMat)
  barrel.name = 'Telescope_Barrel'
  barrel.position.y = 1.48
  payloadGroup.add(barrel)

  const foreCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 20), titaniumMat)
  foreCollar.name = 'Telescope_Fore_Collar'
  foreCollar.position.y = 1.84
  payloadGroup.add(foreCollar)

  const midCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.06, 20), titaniumMat)
  midCollar.name = 'Telescope_Mount_Collar'
  midCollar.position.y = 1.34
  payloadGroup.add(midCollar)

  const apertureOptics = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.04, 20), opticsCyanMat)
  apertureOptics.name = 'Telescope_Optics_Lens'
  apertureOptics.position.y = 1.87
  payloadGroup.add(apertureOptics)

  const secondaryHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.09, 12), titaniumMat)
  secondaryHousing.name = 'Telescope_Secondary_Mirror'
  secondaryHousing.position.y = 2.02
  payloadGroup.add(secondaryHousing)

  // Three thin spider vanes supporting secondary mirror
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    const pRim = new THREE.Vector3(Math.cos(a) * 0.25, 1.87, Math.sin(a) * 0.25)
    const pTop = new THREE.Vector3(Math.cos(a) * 0.055, 2.02, Math.sin(a) * 0.055)
    payloadGroup.add(makeStrut(pRim, pTop, 0.012, titaniumMat, `Spider_Vane_${k + 1}`))
  }

  // Three V-shaped diagonal bipod strut pairs (6 struts) supporting telescope barrel from bus deck
  for (let k = 0; k < 3; k++) {
    const baseAngle = (k / 3) * Math.PI * 2 + Math.PI / 6
    const pTop = new THREE.Vector3(Math.cos(baseAngle) * 0.27, 1.35, Math.sin(baseAngle) * 0.27)
    for (const [legIdx, deltaA] of [
      [1, -0.38],
      [2, 0.38],
    ] as const) {
      const aFoot = baseAngle + deltaA
      const pFoot = new THREE.Vector3(Math.cos(aFoot) * 0.56, 0.94, Math.sin(aFoot) * 0.56)
      payloadGroup.add(makeStrut(pFoot, pTop, 0.024, titaniumMat, `Bipod_Strut_${k + 1}_${legIdx}`))
    }
  }
  root.add(payloadGroup)

  // 5. Photon Shields: Three nested, faceted hexagonal funnel shields expanding upwards
  const shieldsGroup = new THREE.Group()
  shieldsGroup.name = 'Photon_Shields'

  const shieldSpecs = [
    { name: 'Photon_Shield_Inner', rBottom: 0.54, rTop: 1.06, yBottom: 1.18, yTop: 2.48, thickness: 0.032 },
    { name: 'Photon_Shield_Middle', rBottom: 0.64, rTop: 1.34, yBottom: 1.1, yTop: 2.58, thickness: 0.032 },
    { name: 'Photon_Shield_Outer', rBottom: 0.74, rTop: 1.64, yBottom: 1.0, yTop: 2.68, thickness: 0.036 },
  ] as const

  for (const spec of shieldSpecs) {
    const stageGroup = new THREE.Group()
    stageGroup.name = spec.name
    const { outer, inner, rim } = createPolygonalShieldGeometries(6, spec.rBottom, spec.rTop, spec.yBottom, spec.yTop, spec.thickness)

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

  return root
}

/** Disposes geometries and materials created by `buildSpherexObservatory`. */
export function disposeSpherexObservatory(root: THREE.Object3D): void {
  const mats = new Set<THREE.Material>()
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      if (Array.isArray(obj.material)) obj.material.forEach((m) => mats.add(m))
      else if (obj.material) mats.add(obj.material)
    }
  })
  mats.forEach((m) => m.dispose())
}
