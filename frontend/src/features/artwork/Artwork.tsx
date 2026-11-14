import { useId } from 'react'

/**
 * Hand-built SVG artwork in the spirit of the team slide: grainy colour beams, pointed stars
 * and round planet dots. Decorative only (aria-hidden); never placed under text or data.
 */

interface Props {
  variant?: 'hero' | 'band' | 'corner'
  className?: string
}

function starPath(cx: number, cy: number, r: number, points = 8, inner = 0.32): string {
  const pts: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI * i) / points - Math.PI / 2
    const rr = i % 2 === 0 ? r : r * inner
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`)
  }
  return `M${pts.join('L')}Z`
}

export function Artwork({ variant = 'hero', className }: Props) {
  const id = useId().replace(/:/g, '')
  const grain = `grain-${id}`
  const g1 = `g1-${id}`
  const g2 = `g2-${id}`
  const g3 = `g3-${id}`
  const dot1 = `d1-${id}`
  const dot2 = `d2-${id}`

  const defs = (
    <defs>
      <filter id={grain} x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.6" result="mask" />
        <feComposite in="SourceGraphic" in2="mask" operator="in" />
      </filter>
      <linearGradient id={g1} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#E948AC" stopOpacity="0" />
        <stop offset="0.35" stopColor="#E948AC" />
        <stop offset="0.7" stopColor="#FFD184" />
        <stop offset="1" stopColor="#F4EF83" stopOpacity="0.2" />
      </linearGradient>
      <linearGradient id={g2} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#2F9DD0" stopOpacity="0" />
        <stop offset="0.45" stopColor="#2F9DD0" />
        <stop offset="1" stopColor="#8F942F" stopOpacity="0.4" />
      </linearGradient>
      <linearGradient id={g3} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#F4EF83" stopOpacity="0" />
        <stop offset="0.5" stopColor="#F4EF83" />
        <stop offset="1" stopColor="#E948AC" stopOpacity="0.3" />
      </linearGradient>
      <radialGradient id={dot1} cx="0.35" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#FFD184" />
        <stop offset="1" stopColor="#E948AC" />
      </radialGradient>
      <radialGradient id={dot2} cx="0.35" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#9fd8f0" />
        <stop offset="1" stopColor="#2F9DD0" />
      </radialGradient>
    </defs>
  )

  if (variant === 'band') {
    return (
      <svg className={className} viewBox="0 0 1200 220" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
        {defs}
        <g filter={`url(#${grain})`}>
          <path d="M-40 150 C 300 60, 700 220, 1240 70 L 1240 130 C 700 270, 300 110, -40 205 Z" fill={`url(#${g1})`} opacity="0.85" />
          <path d="M-40 60 C 400 140, 800 10, 1240 120 L 1240 150 C 800 50, 400 175, -40 95 Z" fill={`url(#${g2})`} opacity="0.75" />
          <circle cx="980" cy="60" r="22" fill={`url(#${dot1})`} />
          <circle cx="210" cy="170" r="12" fill={`url(#${dot2})`} />
        </g>
        <path d={starPath(640, 110, 34)} fill="#F4EF83" />
        <path d={starPath(1110, 170, 16, 4, 0.25)} fill="#FFF3D6" />
        <path d={starPath(90, 50, 12, 4, 0.25)} fill="#E948AC" />
      </svg>
    )
  }

  if (variant === 'corner') {
    return (
      <svg className={className} viewBox="0 0 400 400" aria-hidden focusable="false">
        {defs}
        <g filter={`url(#${grain})`}>
          <path d="M400 40 C 260 120, 160 220, 60 400 L 160 400 C 240 260, 320 170, 400 130 Z" fill={`url(#${g3})`} opacity="0.85" />
          <circle cx="300" cy="300" r="40" fill={`url(#${dot2})`} />
        </g>
        <path d={starPath(250, 120, 30)} fill="#FFD184" />
        <path d={starPath(340, 210, 12, 4, 0.25)} fill="#FFF3D6" />
      </svg>
    )
  }

  return (
    <svg className={className} viewBox="0 0 640 640" aria-hidden focusable="false">
      {defs}
      <g filter={`url(#${grain})`}>
        <path d="M-40 520 C 160 380, 380 300, 700 120 L 700 240 C 420 380, 220 470, -40 640 Z" fill={`url(#${g1})`} opacity="0.9" />
        <path d="M-40 300 C 180 360, 420 240, 700 300 L 700 360 C 420 300, 200 430, -40 380 Z" fill={`url(#${g2})`} opacity="0.75" />
        <path d="M120 -40 C 260 160, 360 300, 640 470 L 640 520 C 330 360, 220 200, 60 -40 Z" fill={`url(#${g3})`} opacity="0.5" />
        <circle cx="500" cy="120" r="46" fill={`url(#${dot1})`} />
        <circle cx="120" cy="140" r="22" fill={`url(#${dot2})`} />
        <circle cx="560" cy="540" r="16" fill={`url(#${dot1})`} />
      </g>
      <path d={starPath(330, 330, 70, 10, 0.3)} fill="#F4EF83" />
      <path d={starPath(330, 330, 36, 10, 0.4)} fill="#FFF3D6" />
      <path d={starPath(180, 520, 26, 8, 0.3)} fill="#E948AC" />
      <path d={starPath(560, 280, 18, 4, 0.22)} fill="#FFF3D6" />
      <path d={starPath(70, 260, 12, 4, 0.22)} fill="#FFD184" />
    </svg>
  )
}
