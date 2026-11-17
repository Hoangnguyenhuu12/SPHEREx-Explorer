import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { buildSpherexObservatory, disposeSpherexObservatory } from '../src/features/artwork/spherexModel.ts'

// CRC32 table for valid PNG chunks when encoding DataTextures in pure Node.js
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function makePngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodeRgbaToPng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const rowOff = y * (stride + 1)
    raw[rowOff] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, rowOff + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', Buffer.alloc(0)),
  ])
}

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

if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class NodeImageData {
    constructor(data, width, height) {
      this.data = data
      this.width = width
      this.height = height
    }
  }
}

class NodeCanvas {
  constructor() {
    this._width = 1
    this._height = 1
    this._rgba = new Uint8ClampedArray(4)
  }
  get width() {
    return this._width
  }
  set width(w) {
    this._width = Math.max(1, w | 0)
    this._rgba = new Uint8ClampedArray(this._width * this._height * 4)
  }
  get height() {
    return this._height
  }
  set height(h) {
    this._height = Math.max(1, h | 0)
    this._rgba = new Uint8ClampedArray(this._width * this._height * 4)
  }
  getContext() {
    const canvas = this
    return {
      fillStyle: '#000000',
      translate() {},
      scale() {},
      fillRect(x, y, w, h) {
        const hex = String(this.fillStyle).replace('#', '')
        const r = Number.parseInt(hex.slice(0, 2) || '00', 16)
        const g = Number.parseInt(hex.slice(2, 4) || '00', 16)
        const b = Number.parseInt(hex.slice(4, 6) || '00', 16)
        for (let py = y; py < y + h && py < canvas._height; py++) {
          for (let px = x; px < x + w && px < canvas._width; px++) {
            const i = (py * canvas._width + px) * 4
            canvas._rgba[i] = r
            canvas._rgba[i + 1] = g
            canvas._rgba[i + 2] = b
            canvas._rgba[i + 3] = 255
          }
        }
      },
      getImageData(sx, sy, sw, sh) {
        const out = new Uint8ClampedArray(sw * sh * 4)
        for (let row = 0; row < sh; row++) {
          const srcOff = ((sy + row) * canvas._width + sx) * 4
          out.set(canvas._rgba.subarray(srcOff, srcOff + sw * 4), row * sw * 4)
        }
        return new globalThis.ImageData(out, sw, sh)
      },
      putImageData(imgData) {
        canvas._rgba = new Uint8ClampedArray(imgData.data)
      },
      drawImage(src, dx = 0, dy = 0, dw = canvas._width, dh = canvas._height) {
        const srcData = src._rgba ?? src.data
        const sw = src.width
        const sh = src.height
        if (!srcData || !sw || !sh) return
        for (let y = 0; y < dh && dy + y < canvas._height; y++) {
          const sy = Math.min(sh - 1, Math.floor((y / dh) * sh))
          for (let x = 0; x < dw && dx + x < canvas._width; x++) {
            const sx = Math.min(sw - 1, Math.floor((x / dw) * sw))
            const si = (sy * sw + sx) * 4
            const di = ((dy + y) * canvas._width + (dx + x)) * 4
            canvas._rgba[di] = srcData[si]
            canvas._rgba[di + 1] = srcData[si + 1]
            canvas._rgba[di + 2] = srcData[si + 2]
            canvas._rgba[di + 3] = srcData[si + 3]
          }
        }
      },
    }
  }
  toBlob(cb, mimeType = 'image/png') {
    const png = encodeRgbaToPng(this._width, this._height, this._rgba)
    cb(new Blob([png], { type: mimeType }))
  }
}

if (typeof globalThis.HTMLCanvasElement === 'undefined') {
  globalThis.HTMLCanvasElement = NodeCanvas
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') throw new Error(`Unsupported DOM tag in exporter: ${tag}`)
      return new NodeCanvas()
    },
  }
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(scriptDir, '../public/models')
fs.mkdirSync(outDir, { recursive: true })

// Remove obsolete multi-format artifacts so only the baked single .GLB remains
for (const legacy of ['spherex-observatory.obj', 'spherex-observatory.mtl', 'spherex-observatory.gltf']) {
  const legacyPath = path.join(outDir, legacy)
  if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath)
}

const observatory = buildSpherexObservatory()
const exporter = new GLTFExporter()
const glbBuffer = await exporter.parseAsync(observatory, { binary: true, onlyVisible: true })
const outPath = path.join(outDir, 'spherex-observatory.glb')
fs.writeFileSync(outPath, Buffer.from(glbBuffer))

const stat = fs.statSync(outPath)
console.log(`spherex-observatory.glb: ${stat.size} bytes`)

disposeSpherexObservatory(observatory)
