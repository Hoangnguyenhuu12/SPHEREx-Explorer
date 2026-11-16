import { describe, expect, it } from 'vitest'
import { encodeAnimatedGif } from '../features/blink/gifExporter'

describe('encodeAnimatedGif', () => {
  it('writes a valid looping GIF89a header, frame control blocks, and trailer', () => {
    const f1 = new Uint8Array(16 * 16).fill(40)
    const f2 = new Uint8Array(16 * 16).fill(220)
    const gif = encodeAnimatedGif([
      { pixels: f1, width: 16, height: 16, delayCs: 25 },
      { pixels: f2, width: 16, height: 16, delayCs: 25 },
    ])

    const header = String.fromCharCode(...gif.slice(0, 6))
    expect(header).toBe('GIF89a')
    // Width = 16, Height = 16 little-endian
    expect(gif[6]).toBe(16)
    expect(gif[7]).toBe(0)
    expect(gif[8]).toBe(16)
    expect(gif[9]).toBe(0)
    // Netscape looping signature present after the 768-byte Global Color Table
    const gctEnd = 13 + 768
    const appSig = String.fromCharCode(...gif.slice(gctEnd + 3, gctEnd + 14))
    expect(appSig).toBe('NETSCAPE2.0')
    // Ends with standard GIF trailer 0x3b
    expect(gif[gif.length - 1]).toBe(0x3b)
  })

  it('rejects mismatched frame dimensions', () => {
    expect(() =>
      encodeAnimatedGif([
        { pixels: new Uint8Array(4), width: 2, height: 2, delayCs: 10 },
        { pixels: new Uint8Array(9), width: 3, height: 3, delayCs: 10 },
      ]),
    ).toThrow(/dimensions/)
  })
})
