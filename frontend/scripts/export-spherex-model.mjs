import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { buildSpherexObservatory, disposeSpherexObservatory } from '../src/features/artwork/spherexModel.ts'

// Minimal FileReader polyfill so Three.js GLTFExporter works cleanly in Node.js without a DOM.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class NodeFileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf
        this.onloadend?.({ target: this })
        this.onload?.({ target: this })
      })
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        const b64 = Buffer.from(buf).toString('base64')
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`
        this.onloadend?.({ target: this })
        this.onload?.({ target: this })
      })
    }
  }
}

function buildObjAndMtl(root, mtlFileName) {
  const materials = new Map()
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material && !Array.isArray(obj.material)) {
      const mat = obj.material
      const name = (mat.name || `Material_${materials.size + 1}`).replace(/\s+/g, '_')
      if (!materials.has(name)) materials.set(name, mat)
    }
  })

  const mtlLines = ['# SPHEREx Space Observatory Material Library', '']
  for (const [name, mat] of materials) {
    const col = mat.color ?? new THREE.Color('#cccccc')
    const em = mat.emissive ?? new THREE.Color('#000000')
    const emI = mat.emissiveIntensity ?? 0
    const rough = mat.roughness ?? 0.5
    const metal = mat.metalness ?? 0.0
    const shininess = Math.max(8, Math.round((1 - rough) * 180))
    const spec = (0.2 + metal * 0.7).toFixed(3)

    mtlLines.push(`newmtl ${name}`)
    mtlLines.push(`Ka ${(col.r * 0.15).toFixed(4)} ${(col.g * 0.15).toFixed(4)} ${(col.b * 0.15).toFixed(4)}`)
    mtlLines.push(`Kd ${col.r.toFixed(4)} ${col.g.toFixed(4)} ${col.b.toFixed(4)}`)
    mtlLines.push(`Ks ${spec} ${spec} ${spec}`)
    if (emI > 0) {
      mtlLines.push(`Ke ${(em.r * emI).toFixed(4)} ${(em.g * emI).toFixed(4)} ${(em.b * emI).toFixed(4)}`)
    }
    mtlLines.push(`Ns ${shininess}`)
    mtlLines.push('d 1.0000')
    mtlLines.push('illum 2')
    mtlLines.push('')
  }

  root.updateMatrixWorld(true)
  const objLines = ['# SPHEREx Space Observatory 3D Model', `mtllib ${mtlFileName}`, '']
  let vOffset = 1
  let vnOffset = 1
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  const normalMat = new THREE.Matrix3()

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const geo = obj.geometry
    const pos = geo.getAttribute('position')
    if (!pos) return

    const matName = ((obj.material && !Array.isArray(obj.material) ? obj.material.name : '') || 'Material_1').replace(/\s+/g, '_')
    const meshName = (obj.name || 'Part').replace(/\s+/g, '_')
    objLines.push(`g ${meshName}`)
    objLines.push(`usemtl ${matName}`)

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld)
      objLines.push(`v ${v.x.toFixed(5)} ${v.y.toFixed(5)} ${v.z.toFixed(5)}`)
    }

    if (!geo.getAttribute('normal')) geo.computeVertexNormals()
    const normAttr = geo.getAttribute('normal')
    normalMat.getNormalMatrix(obj.matrixWorld)
    for (let i = 0; i < normAttr.count; i++) {
      n.fromBufferAttribute(normAttr, i).applyMatrix3(normalMat).normalize()
      objLines.push(`vn ${n.x.toFixed(5)} ${n.y.toFixed(5)} ${n.z.toFixed(5)}`)
    }

    const index = geo.getIndex()
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i) + vOffset
        const b = index.getX(i + 1) + vOffset
        const c = index.getX(i + 2) + vOffset
        const na = index.getX(i) + vnOffset
        const nb = index.getX(i + 1) + vnOffset
        const nc = index.getX(i + 2) + vnOffset
        objLines.push(`f ${a}//${na} ${b}//${nb} ${c}//${nc}`)
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        const a = i + vOffset
        const b = i + 1 + vOffset
        const c = i + 2 + vOffset
        const na = i + vnOffset
        const nb = i + 1 + vnOffset
        const nc = i + 2 + vnOffset
        objLines.push(`f ${a}//${na} ${b}//${nb} ${c}//${nc}`)
      }
    }
    objLines.push('')
    vOffset += pos.count
    vnOffset += normAttr.count
  })

  return { obj: objLines.join('\n'), mtl: mtlLines.join('\n') }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../public/models')
fs.mkdirSync(outDir, { recursive: true })

const model = buildSpherexObservatory()
const gltfExporter = new GLTFExporter()

const glbBuffer = await gltfExporter.parseAsync(model, { binary: true })
const glbPath = path.join(outDir, 'spherex-observatory.glb')
fs.writeFileSync(glbPath, Buffer.from(glbBuffer))

const gltfJson = await gltfExporter.parseAsync(model, { binary: false })
const gltfPath = path.join(outDir, 'spherex-observatory.gltf')
fs.writeFileSync(gltfPath, JSON.stringify(gltfJson, null, 2), 'utf-8')

const mtlName = 'spherex-observatory.mtl'
const { obj, mtl } = buildObjAndMtl(model, mtlName)
const objPath = path.join(outDir, 'spherex-observatory.obj')
const mtlPath = path.join(outDir, mtlName)
fs.writeFileSync(objPath, obj, 'utf-8')
fs.writeFileSync(mtlPath, mtl, 'utf-8')

disposeSpherexObservatory(model)

for (const p of [glbPath, gltfPath, objPath, mtlPath]) {
  console.log(`${path.basename(p)}: ${fs.statSync(p).size} bytes`)
}
