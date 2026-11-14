import { useReducedMotion } from 'motion/react'
import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { makeField, renderField, toGray } from '../../shared/api/mock/synth'

/**
 * Landing preview: a generated star patch with one moving star, cycling through three dates.
 * Clearly labelled "Illustrative demo"; independent from real observations.
 */

const SIZE = 48
const DATES = ['Date 1', 'Date 2', 'Date 3']

function frames(): ImageData[] {
  const field = makeField(20261114, SIZE, 26)
  return DATES.map((_, i) => {
    const stars = [...field, { x: 20 + i * 3, y: 26 - i * 1.5, flux: 1.2 }]
    const img = renderField(SIZE, stars, 99 + i)
    const gray = toGray(img, 1.0)
    const rgba = new Uint8ClampedArray(SIZE * SIZE * 4)
    for (let k = 0; k < gray.length; k++) {
      rgba[k * 4] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = gray[k]
      rgba[k * 4 + 3] = 255
    }
    return new ImageData(rgba, SIZE, SIZE)
  })
}

export function SkyPreview() {
  const reduce = useReducedMotion()
  const [playing, setPlaying] = useState(!reduce)
  const [i, setI] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dataRef = useRef<ImageData[] | null>(null)

  useEffect(() => {
    dataRef.current = frames()
  }, [])

  useEffect(() => {
    const c = canvasRef.current
    const d = dataRef.current?.[i]
    if (c && d) c.getContext('2d')!.putImageData(d, 0, 0)
  }, [i])

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setI((n) => (n + 1) % DATES.length), 900)
    return () => clearInterval(t)
  }, [playing])

  return (
    <figure className="sky-preview">
      <div className="sky-preview__frame">
        <canvas ref={canvasRef} width={SIZE} height={SIZE} role="img" aria-label={`Illustrative star field, ${DATES[i]} of 3. One star shifts between dates.`} />
        <span className="sky-preview__date num">{DATES[i]}</span>
      </div>
      <figcaption className="sky-preview__bar">
        <span className="demo-tag">Illustrative demo</span>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={playing ? 'Pause preview' : 'Play preview'} onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </button>
      </figcaption>
    </figure>
  )
}
