import { useId } from 'react'

/**
 * Original stylised illustration of the SPHEREx observatory: three nested cone-shaped photon
 * shields around the telescope, a hexagonal spacecraft bus and a fixed solar panel. Not to scale.
 */
export function SpherexCraft({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  const metal = `metal-${id}`
  const inner = `inner-${id}`
  const panel = `panel-${id}`
  const glow = `glow-${id}`
  const beam = `beam-${id}`
  return (
    <svg className={className} viewBox="0 0 520 520" role="img" aria-label="Illustration of the SPHEREx space telescope">
      <defs>
        <linearGradient id={metal} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7d7f8c" />
          <stop offset="0.35" stopColor="#f2f0ea" />
          <stop offset="0.6" stopColor="#c9c7c0" />
          <stop offset="1" stopColor="#5d5f6b" />
        </linearGradient>
        <linearGradient id={inner} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2a38" />
          <stop offset="1" stopColor="#0d0d14" />
        </linearGradient>
        <linearGradient id={panel} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f4f7a" />
          <stop offset="1" stopColor="#0f2740" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F4EF83" stopOpacity="0.55" />
          <stop offset="1" stopColor="#F4EF83" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={beam} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E948AC" stopOpacity="0" />
          <stop offset="0.5" stopColor="#E948AC" stopOpacity="0.55" />
          <stop offset="1" stopColor="#2F9DD0" stopOpacity="0.7" />
        </linearGradient>
      </defs>

      {/* Light collected by the telescope */}
      <path d="M40 120 L250 205 L250 245 L40 300 Z" fill={`url(#${beam})`} opacity="0.55" />

      <g transform="rotate(-18 300 260)">
        {/* Photon shields: three nested open cones */}
        <path d="M200 120 L420 70 L420 450 L200 400 Z" fill={`url(#${metal})`} />
        <ellipse cx="420" cy="260" rx="34" ry="190" fill={`url(#${inner})`} stroke="#d9d6cd" strokeWidth="3" />
        <path d="M230 150 L395 112 L395 408 L230 370 Z" fill={`url(#${metal})`} opacity="0.85" />
        <ellipse cx="395" cy="260" rx="27" ry="148" fill={`url(#${inner})`} stroke="#bdbab2" strokeWidth="2" />
        <path d="M258 180 L370 155 L370 365 L258 340 Z" fill={`url(#${metal})`} opacity="0.75" />
        <ellipse cx="370" cy="260" rx="20" ry="105" fill={`url(#${inner})`} stroke="#a5a29b" strokeWidth="2" />
        {/* Telescope aperture glint */}
        <circle cx="370" cy="260" r="38" fill={`url(#${glow})`} />
        <circle cx="368" cy="260" r="9" fill="#2F9DD0" opacity="0.9" />

        {/* Spacecraft bus */}
        <path d="M150 215 L200 196 L200 324 L150 305 Z" fill="#c4a14a" />
        <path d="M110 230 L150 215 L150 305 L110 290 Z" fill="#8e7432" />
        <rect x="104" y="246" width="10" height="28" rx="2" fill="#5d5f6b" />
        {/* Solar panel */}
        <path d="M60 330 L200 330 L215 392 L75 392 Z" fill={`url(#${panel})`} stroke="#6fa8d6" strokeWidth="2" />
        <path d="M95 330 L110 392 M130 330 L145 392 M165 330 L180 392 M67 361 L208 361" stroke="#6fa8d6" strokeWidth="1.2" opacity="0.7" />
        <rect x="150" y="305" width="8" height="26" fill="#8a8c96" />
      </g>
    </svg>
  )
}
