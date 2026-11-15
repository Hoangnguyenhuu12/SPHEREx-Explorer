import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import {
  centreOn,
  fitViewport,
  pan,
  pixelCentreToScreen,
  scaleForFov,
  screenToImage,
  syncedToViewport,
  viewportToSynced,
  visibleFovArcmin,
  zoomAt,
  type SyncedView,
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

export interface GaiaOverlayMarker {
  px: [number, number]
  sourceId: string
  propagated: boolean
  gMag?: number | null
  dxPx?: number
  dyPx?: number
}

export interface SpotFeedbackOverlay {
  clickPx: [number, number]
  targetPx: [number, number] | null
  hit: boolean
}

export interface RulerOverlay {
  p1: [number, number]
  p2: [number, number]
  label: string
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
  gaiaMarkers?: GaiaOverlayMarker[]
  spotFeedback?: SpotFeedbackOverlay | null
  ruler?: RulerOverlay | null
  stretch?: 'default' | 'high-contrast' | 'invert'
  clickMode?: boolean
  picked?: [number, number] | null
  pickedLabel?: string
  initialFovArcmin?: number | null
  syncedView?: SyncedView | null
  onSyncedViewChange?: (view: SyncedView) => void
  label: string
  onFovChange?: (arcmin: number, byUser: boolean) => void
  onPixelClick?: (x: number, y: number) => void
}

function drawTag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  ctx.save()
  ctx.font = '700 11px Andika, system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(9, 9, 13, 0.92)'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}

export const BlinkCanvas = forwardRef<BlinkCanvasHandle, Props>(function BlinkCanvas(
  {
    bitmap,
    gridW,
    gridH,
    pixArcsec,
    crosshair,
    showCrosshair,
    flagsOverlay,
    trail,
    gaiaMarkers,
    spotFeedback,
    ruler,
    stretch = 'default',
    clickMode,
    picked,
    pickedLabel = 'You',
    initialFovArcmin,
    syncedView,
    onSyncedViewChange,
    label,
    onFovChange,
    onPixelClick,
  },
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
    if (bitmap) {
      ctx.save()
      if (stretch === 'high-contrast') {
        ctx.filter = 'contrast(185%) brightness(120%)'
      } else if (stretch === 'invert') {
        ctx.filter = 'invert(100%) contrast(135%)'
      }
      ctx.drawImage(bitmap, v.offsetX, v.offsetY, gridW * v.scale, gridH * v.scale)
      ctx.restore()
    }
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

    // 1. Gaia DR3 reference stars: cyan hollow circles (+ optional motion vector in science mode)
    if (gaiaMarkers && gaiaMarkers.length) {
      const r = Math.max(5, Math.min(8, v.scale * 1.4))
      gaiaMarkers.forEach((m, idx) => {
        const s = pixelCentreToScreen(v, m.px)
        ctx.save()
        ctx.strokeStyle = m.propagated ? '#2F9DD0' : '#9CA3AF'
        ctx.lineWidth = 1.6
        if (!m.propagated) ctx.setLineDash([2, 2])
        ctx.beginPath()
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2)
        ctx.stroke()
        if (m.propagated && (m.dxPx || m.dyPx)) {
          const end = pixelCentreToScreen(v, [m.px[0] + (m.dxPx ?? 0), m.px[1] + (m.dyPx ?? 0)])
          ctx.beginPath()
          ctx.moveTo(s.x, s.y)
          ctx.lineTo(end.x, end.y)
          ctx.stroke()
        }
        ctx.restore()
        if (idx === 0 || v.scale >= 2.2) {
          drawTag(ctx, s.x + r + 4, s.y, 'Gaia', m.propagated ? '#7CCDF2' : '#C9C2B7')
        }
      })
    }

    // 2. Predicted target position: yellow crosshair (+)
    if (showCrosshair && crosshair) {
      const s = pixelCentreToScreen(v, crosshair)
      const gap = Math.max(6, v.scale * 1.5)
      const len = gap + 12
      ctx.save()
      ctx.strokeStyle = '#F4EF83'
      ctx.lineWidth = 1.75
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
      drawTag(ctx, s.x + len + 4, s.y - 6, 'Pred', '#F4EF83')
    }

    // 3. User's own pick: pink diamond (◇)
    if (picked) {
      const s = pixelCentreToScreen(v, picked)
      const r = Math.max(7, Math.min(11, v.scale * 1.6))
      ctx.save()
      ctx.strokeStyle = '#E948AC'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(s.x, s.y - r)
      ctx.lineTo(s.x + r, s.y)
      ctx.lineTo(s.x, s.y + r)
      ctx.lineTo(s.x - r, s.y)
      ctx.closePath()
      ctx.stroke()
      ctx.fillStyle = '#E948AC'
      ctx.beginPath()
      ctx.arc(s.x, s.y, 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      drawTag(ctx, s.x + r + 4, s.y + 8, pickedLabel, '#FF8AD0')
    }

    // 4. Spot-the-star challenge feedback ring
    if (spotFeedback) {
      const s = pixelCentreToScreen(v, spotFeedback.clickPx)
      const r = Math.max(10, Math.min(16, v.scale * 2.2))
      const color = spotFeedback.hit ? '#34D399' : '#FBBF24'
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = 2.2
      ctx.beginPath()
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      drawTag(ctx, s.x + r + 5, s.y, spotFeedback.hit ? '✓ Found!' : 'Try closer', color)
    }

    // 5. Astrometry ruler measurement overlay (A -> B)
    if (ruler) {
      const s1 = pixelCentreToScreen(v, ruler.p1)
      const s2 = pixelCentreToScreen(v, ruler.p2)
      ctx.save()
      ctx.strokeStyle = '#FBBF24'
      ctx.fillStyle = '#FBBF24'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(s1.x, s1.y)
      ctx.lineTo(s2.x, s2.y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(s1.x, s1.y, 3.5, 0, Math.PI * 2)
      ctx.arc(s2.x, s2.y, 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      drawTag(ctx, s1.x + 6, s1.y - 8, 'A', '#FDE68A')
      drawTag(ctx, s2.x + 6, s2.y + 8, `B · ${ruler.label}`, '#FBBF24')
    }
  }, [bitmap, gridW, gridH, flagsOverlay, trail, gaiaMarkers, showCrosshair, crosshair, picked, pickedLabel, spotFeedback, ruler, stretch])

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
    (v: Viewport, notifySync = true) => {
      touchedRef.current = true
      viewRef.current = v
      draw()
      emitFov()
      const { w, h } = sizeRef.current
      if (notifySync && onSyncedViewChange && w > 0 && h > 0) {
        onSyncedViewChange(viewportToSynced(v, w, h, pixArcsec))
      }
    },
    [draw, emitFov, onSyncedViewChange, pixArcsec],
  )

  const fit = useCallback(() => {
    const { w, h } = sizeRef.current
    if (!w || !h) return
    setView(fitViewport(gridW, gridH, w, h))
    touchedRef.current = false
  }, [gridW, gridH, setView])

  // Apply external synchronized viewport updates (for Compare two dates).
  useEffect(() => {
    if (!syncedView) return
    const { w, h } = sizeRef.current
    if (!w || !h) return
    viewRef.current = syncedToViewport(syncedView, w, h, pixArcsec)
    touchedRef.current = true
    draw()
    emitFov(false)
  }, [syncedView, pixArcsec, draw, emitFov])

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
      if (syncedView && w > 0 && h > 0) {
        viewRef.current = syncedToViewport(syncedView, w, h, pixArcsec)
        emitFovRef.current(false)
      } else if (first || !viewRef.current || !touchedRef.current) {
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
      Enter: () => {
        if (!clickMode || !onPixelClick) return
        const p = screenToImage(v, sizeRef.current.w / 2, sizeRef.current.h / 2)
        const x = Math.floor(p.x)
        const y = Math.floor(p.y)
        if (x >= 0 && y >= 0 && x < gridW && y < gridH) onPixelClick(x, y)
      },
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
