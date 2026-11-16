/** Minimal browser-native animated GIF89a exporter for observation blink sequences. */

export interface GifFrameInput {
  pixels: Uint8Array
  width: number
  height: number
  delayCs: number
}

const CLEAR_CODE = 256
const EOI_CODE = 257

function writeUint16LE(out: number[], value: number) {
  out.push(value & 0xff, (value >> 8) & 0xff)
}

function writeAscii(out: number[], text: string) {
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i))
}

function lzwSubBlocks(pixels: Uint8Array): number[] {
  const packed: number[] = []
  let acc = 0
  let bits = 0

  const emit = (code: number) => {
    acc |= code << bits
    bits += 9
    while (bits >= 8) {
      packed.push(acc & 0xff)
      acc >>>= 8
      bits -= 8
    }
  }

  emit(CLEAR_CODE)
  let sinceClear = 0
  for (let i = 0; i < pixels.length; i++) {
    emit(pixels[i] & 0xff)
    sinceClear++
    if (sinceClear >= 120) {
      emit(CLEAR_CODE)
      sinceClear = 0
    }
  }
  emit(EOI_CODE)
  if (bits > 0) packed.push(acc & 0xff)

  const blocks: number[] = [8]
  for (let i = 0; i < packed.length; i += 255) {
    const chunk = packed.slice(i, i + 255)
    blocks.push(chunk.length, ...chunk)
  }
  blocks.push(0)
  return blocks
}

/** Encode grayscale 8-bit frames into a looping GIF89a binary buffer. */
export function encodeAnimatedGif(frames: GifFrameInput[]): Uint8Array<ArrayBuffer> {
  if (frames.length === 0) throw new Error('At least one frame is required to export GIF')
  const { width, height } = frames[0]
  if (width <= 0 || height <= 0) throw new Error('Invalid frame dimensions')

  const out: number[] = []
  writeAscii(out, 'GIF89a')

  // Logical screen descriptor: 256-entry grayscale Global Color Table (GCT flag=1, res=7, size=7 -> 0xF7).
  writeUint16LE(out, width)
  writeUint16LE(out, height)
  out.push(0xf7, 0, 0)

  for (let i = 0; i < 256; i++) out.push(i, i, i)

  // NETSCAPE 2.0 application extension for infinite looping.
  out.push(0x21, 0xff, 0x0b)
  writeAscii(out, 'NETSCAPE2.0')
  out.push(0x03, 0x01, 0x00, 0x00, 0x00)

  for (const frame of frames) {
    if (frame.width !== width || frame.height !== height || frame.pixels.length !== width * height) {
      throw new Error('All GIF frames must match screen dimensions')
    }
    const delay = Math.max(4, Math.round(frame.delayCs))
    out.push(0x21, 0xf9, 0x04, 0x04)
    writeUint16LE(out, delay)
    out.push(0, 0)

    out.push(0x2c)
    writeUint16LE(out, 0)
    writeUint16LE(out, 0)
    writeUint16LE(out, width)
    writeUint16LE(out, height)
    out.push(0)

    out.push(...lzwSubBlocks(frame.pixels))
  }

  out.push(0x3b)
  const buf = new ArrayBuffer(out.length)
  const result = new Uint8Array(buf)
  result.set(out)
  return result
}

/** Render a sequence of observation ImageBitmaps with date captions into an animated GIF Blob. */
export function renderSequenceGif(bitmaps: ImageBitmap[], labels: string[], fps: number, size = 160): Blob {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const delayCs = Math.max(8, Math.round(100 / Math.max(0.5, fps)))

  const frames: GifFrameInput[] = bitmaps.map((bmp, idx) => {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size, size)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bmp, 0, 0, size, size)

    const label = labels[idx]
    if (label) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)'
      ctx.fillRect(0, size - 18, size, 18)
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = '#ffffff'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, 6, size - 9)
    }

    const rgba = ctx.getImageData(0, 0, size, size).data
    const pixels = new Uint8Array(size * size)
    for (let i = 0; i < pixels.length; i++) {
      const r = rgba[i * 4]
      const g = rgba[i * 4 + 1]
      const b = rgba[i * 4 + 2]
      pixels[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    }
    return { pixels, width: size, height: size, delayCs }
  })

  return new Blob([encodeAnimatedGif(frames)], { type: 'image/gif' })
}
