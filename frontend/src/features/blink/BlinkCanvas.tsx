import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import {
  centreOn,
  fitViewport,
  pan,
  pixelCentreToScreen,
  scaleForFov,
  screenToImage,
  visibleFovArcmin,
  zoomAt,
  type Viewport,
} from './viewport'

export interface BlinkCanvasHandle {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  setFov: (arcmin: number) => void
}

export interface TrailPoint {
  px: [number, number]
  kind: 'measured' | 'predicted'
  active: boolean
}

interface Props {
  bitmap: ImageBitmap | null
  gridW: number
  gridH: number
  pixArcsec: number
  crosshair: [number, number] | null
  showCrosshair: boolean
  flagsOverlay?: HTMLImageElement | null
  trail?: TrailPoint[]
  clickMode?: boolean
  picked?: [number, number] | null
  initialFovArcmin?: number | null
  label: string
  onFovChange?: (arcmin: number, byUser: boolean) => void
  onPixelClick?: (x: number, y: number) => void
}

export const BlinkCanvas = forwardRef<BlinkCanvasHandle, Props>(function BlinkCanvas(
  { bitmap, gridW, gridH, pixArcsec, crosshair, showCrosshair, flagsOverlay, trail, clickMode, picked, initialFovArcmin, label, onFovChange, onPixelClick },
  ref,
) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<Viewport | null>(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  /** Until the user zooms or pans, a resize re-fits the image. */
  const touchedRef = useRef(false)
  const [, force] = useState(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const v = viewRef.current
    if (!canvas || !v) return
    const { w, h } = sizeRef.current
    const dpr = window.devicePixelRatio || 1
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    if (bitmap) ctx.drawImage(bitmap, v.offsetX, v.offsetY, gridW * v.scale, gridH * v.scale)
    if (flagsOverlay) ctx.drawImage(flagsOverlay, v.offsetX, v.offsetY, gridW * v.scale, gridH * v.scale)

    if (trail && trail.length) {
      const pts = (k: TrailPoint['kind']) => trail.filter((t) => t.kind === k)
      const line = (list: TrailPoint[], color: string, dash: number[]) => {
        if (list.length < 2) return
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.setLineDash(dash)
        ctx.beginPath()
        list.forEach((p, i) => {
          const s = pixelCentreToScreen(v, p.px)
          if (i === 0) ctx.moveTo(s.x, s.y)
          else ctx.lineTo(s.x, s.y)
        })
        ctx.stroke()
        ctx.restore()
      }
      line(pts('predicted'), '#E948AC', [5, 4])
      line(pts('measured'), '#2F9DD0', [])
      for (const p of trail) {
        const s = pixelCentreToScreen(v, p.px)
        ctx.beginPath()
        ctx.fillStyle = p.kind === 'measured' ? '#2F9DD0' : '#E948AC'
        if (p.kind === 'measured') ctx.arc(s.x, s.y, p.active ? 5 : 3, 0, Math.PI * 2)
        else ctx.rect(s.x - (p.active ? 4 : 2.5), s.y - (p.active ? 4 : 2.5), p.active ? 8 : 5, p.active ? 8 : 5)
        ctx.fill()
      }
    }

    if (showCrosshair && crosshair) {
      const s = pixelCentreToScreen(v, crosshair)
      const gap = Math.max(6, v.scale * 1.5)
      const len = gap + 12
      ctx.save()
      ctx.strokeStyle = '#F4EF83'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(s.x - len, s.y)
      ctx.lineTo(s.x - gap, s.y)
      ctx.moveTo(s.x + gap, s.y)
      ctx.lineTo(s.x + len, s.y)
      ctx.moveTo(s.x, s.y - len)
      ctx.lineTo(s.x, s.y - gap)
      ctx.moveTo(s.x, s.y + gap)
      ctx.lineTo(s.x, s.y + len)
      ctx.stroke()
      ctx.restore()
    }

    if (picked) {
      const s = pixelCentreToScreen(v, picked)
      ctx.save()
      ctx.strokeStyle = '#2F9DD0'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(s.x, s.y, Math.max(6, v.scale), 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }, [bitmap, gridW, gridH, flagsOverlay, trail, showCrosshair, crosshair, picked])

  const drawRef = useRef(draw)
  drawRef.current = draw

  const emitFov = useCallback(
    (byUser = true) => {
      const v = viewRef.current
      if (v && onFovChange) onFovChange(visibleFovArcmin(v, sizeRef.current.w, pixArcsec), byUser)
    },
    [onFovChange, pixArcsec],
  )

  const emitFovRef = useRef(emitFov)
  emitFovRef.current = emitFov

  const setView = useCallback(
    (v: Viewport) => {
      touchedRef.current = true
      viewRef.current = v
      draw()
      emitFov()
    },
    [draw, emitFov],
  )

  const fit = useCallback(() => {
    const { w, h } = sizeRef.current
    if (!w || !h) return
    setView(fitViewport(gridW, gridH, w, h))
    touchedRef.current = false
  }, [gridW, gridH, setView])

  // Resize observer keeps the canvas crisp at the device pixel ratio.
  useLayoutEffect(() => {
    const box = boxRef.current
    const canvas = canvasRef.current
    if (!box || !canvas) return
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width)
      const h = Math.round(entry.contentRect.height)
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      const first = sizeRef.current.w === 0
      sizeRef.current = { w, h }
      if (first || !viewRef.current || !touchedRef.current) {
        if (initialFovArcmin) {
          const s = scaleForFov(initialFovArcmin, w, pixArcsec)
          viewRef.current = centreOn(gridW / 2, gridH / 2, s, w, h)
        } else viewRef.current = fitViewport(gridW, gridH, w, h)
        emitFovRef.current(false)
      }
      drawRef.current()
      force((n) => n + 1)
    })
    ro.observe(box)
    return () => ro.disconnect()
    // oxlint-disable-next-line react/exhaustive-deps
  }, [gridW, gridH])

  useEffect(() => {
    draw()
  }, [draw])

  useImperativeHandle(
    ref,
    () => ({
      zoomIn() {
        const v = viewRef.current
        if (v) setView(zoomAt(v, 1.5, sizeRef.current.w / 2, sizeRef.current.h / 2))
      },
      zoomOut() {
        const v = viewRef.current
        if (v) setView(zoomAt(v, 1 / 1.5, sizeRef.current.w / 2, sizeRef.current.h / 2))
      },
      fit,
      setFov(arcmin) {
        const v = viewRef.current
        if (!v) return
        const { w, h } = sizeRef.current
        const target = scaleForFov(arcmin, w, pixArcsec)
        setView(zoomAt(v, target / v.scale, w / 2, h / 2))
      },
    }),
    [fit, pixArcsec, setView],
  )

  const onWheel = (e: React.WheelEvent) => {
    const v = viewRef.current
    if (!v) return
    const r = canvasRef.current!.getBoundingClientRect()
    setView(zoomAt(v, e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top))
  }

  // Wheel must be non-passive to stop page scroll while zooming the image.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const stop = (e: WheelEvent) => e.preventDefault()
    c.addEventListener('wheel', stop, { passive: false })
    return () => c.removeEventListener('wheel', stop)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    const v = viewRef.current
    if (!d || !v) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true
    d.x = e.clientX
    d.y = e.clientY
    if (d.moved) setView(pan(v, dx, dy))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    const v = viewRef.current
    if (!d || d.moved || !v || !clickMode || !onPixelClick) return
    const r = canvasRef.current!.getBoundingClientRect()
    const p = screenToImage(v, e.clientX - r.left, e.clientY - r.top)
    const x = Math.floor(p.x)
    const y = Math.floor(p.y)
    if (x >= 0 && y >= 0 && x < gridW && y < gridH) onPixelClick(x, y)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const v = viewRef.current
    if (!v) return
    const step = 24
    const map: Record<string, () => void> = {
      ArrowLeft: () => setView(pan(v, step, 0)),
      ArrowRight: () => setView(pan(v, -step, 0)),
      ArrowUp: () => setView(pan(v, 0, step)),
      ArrowDown: () => setView(pan(v, 0, -step)),
      '+': () => setView(zoomAt(v, 1.5, sizeRef.current.w / 2, sizeRef.current.h / 2)),
      '=': () => setView(zoomAt(v, 1.5, sizeRef.current.w / 2, sizeRef.current.h / 2)),
      '-': () => setView(zoomAt(v, 1 / 1.5, sizeRef.current.w / 2, sizeRef.current.h / 2)),
      '0': fit,
    }
    const fn = map[e.key]
    if (fn) {
      e.preventDefault()
      e.stopPropagation()
      fn()
    }
  }

  return (
    <div ref={boxRef} className={`blink-canvas${clickMode ? ' is-picking' : ''}`}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={label}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      />
    </div>
  )
})
