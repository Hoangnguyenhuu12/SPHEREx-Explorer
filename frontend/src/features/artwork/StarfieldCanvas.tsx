import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { mulberry32 } from '../../shared/api/mock/synth'

/**
 * Decorative animated sky: twinkling stars, slow drift and occasional shooting stars.
 * Pure canvas, paused when hidden or off-screen, still under reduced motion.
 */

interface Props {
  className?: string
  density?: number
  shootingEverySec?: number
  drift?: boolean
}

interface Star {
  x: number
  y: number
  r: number
  base: number
  speed: number
  phase: number
  hue: string
}

interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  len: number
}

const HUES = ['255,243,214', '255,243,214', '255,243,214', '244,239,131', '159,216,240', '233,72,172']

export function StarfieldCanvas({ className, density = 1, shootingEverySec = 2.8, drift = true }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = 0
    let h = 0
    let stars: Star[] = []
    const meteors: Meteor[] = []
    let raf = 0
    let last = performance.now()
    let nextMeteor = 1.2
    let visible = true
    const rnd = mulberry32(1977)

    const build = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.round(((w * h) / 5200) * density)
      stars = Array.from({ length: n }, () => {
        const big = rnd() < 0.06
        return {
          x: rnd() * w,
          y: rnd() * h,
          r: big ? 1.2 + rnd() * 1.1 : 0.35 + rnd() * 0.7,
          base: 0.35 + rnd() * 0.6,
          speed: 0.6 + rnd() * 2.2,
          phase: rnd() * Math.PI * 2,
          hue: HUES[Math.floor(rnd() * HUES.length)],
        }
      })
    }

    const spawnMeteor = () => {
      const fromTop = rnd() < 0.6
      const x = fromTop ? w * (0.15 + rnd() * 0.8) : w * (0.6 + rnd() * 0.4)
      const y = fromTop ? -20 : h * rnd() * 0.4
      const speed = 520 + rnd() * 420
      const angle = Math.PI * (0.72 + rnd() * 0.1) // down-left
      meteors.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0, max: 0.9 + rnd() * 0.6, len: 110 + rnd() * 120 })
    }

    const draw = (t: number, dt: number) => {
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) {
        const tw = reduce ? 1 : 0.55 + 0.45 * Math.sin(t * s.speed + s.phase)
        const a = s.base * tw
        if (drift && !reduce) {
          s.x -= dt * 2.2 * s.r
          if (s.x < -2) s.x = w + 2
        }
        ctx.beginPath()
        ctx.fillStyle = `rgba(${s.hue},${a.toFixed(3)})`
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
        if (s.r > 1.2 && a > 0.6) {
          // Sparkle cross on the brightest stars.
          ctx.strokeStyle = `rgba(${s.hue},${(a * 0.45).toFixed(3)})`
          ctx.lineWidth = 0.6
          const k = s.r * 4 * tw
          ctx.beginPath()
          ctx.moveTo(s.x - k, s.y)
          ctx.lineTo(s.x + k, s.y)
          ctx.moveTo(s.x, s.y - k)
          ctx.lineTo(s.x, s.y + k)
          ctx.stroke()
        }
      }
      if (reduce) return
      nextMeteor -= dt
      if (nextMeteor <= 0) {
        spawnMeteor()
        nextMeteor = shootingEverySec * (0.6 + rnd() * 0.9)
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        m.life += dt
        m.x += m.vx * dt
        m.y += m.vy * dt
        const fade = Math.sin(Math.min(1, m.life / m.max) * Math.PI)
        const sp = Math.hypot(m.vx, m.vy)
        const tx = m.x - (m.vx / sp) * m.len
        const ty = m.y - (m.vy / sp) * m.len
        const g = ctx.createLinearGradient(m.x, m.y, tx, ty)
        g.addColorStop(0, `rgba(255,248,225,${(0.95 * fade).toFixed(3)})`)
        g.addColorStop(0.3, `rgba(244,239,131,${(0.5 * fade).toFixed(3)})`)
        g.addColorStop(1, 'rgba(233,72,172,0)')
        ctx.strokeStyle = g
        ctx.lineWidth = 1.6
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(m.x, m.y)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.beginPath()
        ctx.fillStyle = `rgba(255,250,235,${fade.toFixed(3)})`
        ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2)
        ctx.fill()
        if (m.life > m.max || m.x < -300 || m.y > h + 300) meteors.splice(i, 1)
      }
    }

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (visible) draw(now / 1000, dt)
      raf = requestAnimationFrame(loop)
    }

    build()
    if (reduce) draw(0, 0)
    else raf = requestAnimationFrame(loop)

    const ro = new ResizeObserver(() => {
      build()
      if (reduce) draw(0, 0)
    })
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
    })
    io.observe(canvas)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [reduce, density, shootingEverySec, drift])

  return <canvas ref={ref} className={className} aria-hidden />
}
