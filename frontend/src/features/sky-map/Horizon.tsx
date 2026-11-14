/**
 * Illustrative foreground: a dark landscape and a faint horizon glow along the bottom of the
 * sky map, to give the feeling of standing on Earth and looking up. Decorative only; it does
 * not represent the real horizon for any place or time.
 */
export function Horizon() {
  return (
    <div className="horizon" aria-hidden>
      <svg viewBox="0 0 1600 200" preserveAspectRatio="none" className="horizon__svg">
        <defs>
          <linearGradient id="horizon-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2F9DD0" stopOpacity="0" />
            <stop offset="0.75" stopColor="#2F9DD0" stopOpacity="0.16" />
            <stop offset="1" stopColor="#E948AC" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="horizon-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#141826" />
            <stop offset="1" stopColor="#0b0d16" />
          </linearGradient>
          <linearGradient id="horizon-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#090a10" />
            <stop offset="1" stopColor="#050507" />
          </linearGradient>
        </defs>
        <rect x="0" y="40" width="1600" height="90" fill="url(#horizon-glow)" />
        {/* Distant hills */}
        <path
          d="M0 132 C 120 108, 220 118, 330 104 S 560 92, 690 112 S 900 126, 1040 100 S 1290 88, 1420 108 S 1560 118, 1600 112 L1600 200 L0 200 Z"
          fill="url(#horizon-far)"
        />
        {/* Near ground with a few trees */}
        <path
          d="M0 160 C 160 146, 300 156, 470 148 S 760 138, 920 150 S 1210 162, 1380 146 S 1540 140, 1600 150 L1600 200 L0 200 Z"
          fill="url(#horizon-near)"
        />
        <g fill="#050507">
          <path d="M210 152 l10 -38 l10 38 z M226 154 l8 -28 l8 28 z" />
          <path d="M1188 156 l12 -46 l12 46 z M1208 158 l9 -32 l9 32 z M1172 158 l7 -24 l7 24 z" />
          <path d="M760 142 l6 -22 l6 22 z" />
        </g>
        {/* Small observatory dome */}
        <g fill="#060608">
          <rect x="1386" y="128" width="40" height="20" />
          <path d="M1384 129 a22 18 0 0 1 44 0 z" />
        </g>
        <rect x="1404" y="112" width="3" height="10" fill="#F4EF83" opacity="0.5" />
      </svg>
    </div>
  )
}
