/**
 * Small explanatory diagrams for the Story page. Plain SVG, colours from the design tokens
 * (CSS variables are applied through `style`, since SVG presentation attributes cannot read them).
 * Every number here is already stated on the page or in shared/config/targets.ts.
 */
import type { CSSProperties, ReactNode } from 'react'

const ink: CSSProperties = { fill: 'var(--fg)' }
const muted: CSSProperties = { fill: 'var(--muted)' }
const heading: CSSProperties = { fill: 'var(--heading)' }
const line: CSSProperties = { stroke: 'var(--line-strong)', fill: 'none' }

function Figure({
  label,
  note,
  height = 220,
  children,
}: {
  label: string
  note: ReactNode
  height?: number
  children: ReactNode
}) {
  return (
    <figure className="diagram">
      <svg viewBox={`0 0 560 ${height}`} role="img" aria-label={label}>
        {children}
      </svg>
      <figcaption className="diagram-note">
        <strong>Note:</strong> {note}
      </figcaption>
    </figure>
  )
}

/** One detector with a filter whose colour changes along it; a star crossing it is seen in many colours. */
export function ColourDiagram() {
  const stars = [
    { x: 150, label: 'Exposure 1' },
    { x: 280, label: 'Exposure 2' },
    { x: 410, label: 'Exposure 3' },
  ]
  return (
    <Figure
      label="Diagram: a SPHEREx detector whose filter changes colour from one side to the other. As the sky drifts, the same star lands on a different colour in each exposure."
      note={
        <>
          Each of SPHEREx’s six detectors sits behind a filter that changes colour from one edge to the other. As the
          telescope steps across the sky, the same star is photographed through many colours. Together the detectors cover
          0.75 to 5 micrometres in 102 colours, with pixels about 6.15 arcseconds wide.
        </>
      }
    >
      <defs>
        <linearGradient id="lvf" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--blue)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--pink)' }} />
          <stop offset="1" style={{ stopColor: 'var(--primary)' }} />
        </linearGradient>
        <marker id="drift-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0L10 5L0 10z" style={{ fill: 'var(--heading)' }} />
        </marker>
      </defs>
      <text x="80" y="30" className="diagram-label">
        shorter wavelength
      </text>
      <text x="480" y="30" textAnchor="end" className="diagram-label">
        longer wavelength
      </text>
      <rect x="80" y="44" width="400" height="96" rx="6" fill="url(#lvf)" opacity="0.85" />
      <rect x="80" y="44" width="400" height="96" rx="6" style={line} />
      {stars.map((s) => (
        <g key={s.label}>
          <circle cx={s.x} cy="92" r="9" style={{ fill: 'var(--fg)' }} />
          <text x={s.x} y="166" textAnchor="middle" className="diagram-label">
            {s.label}
          </text>
        </g>
      ))}
      <path d="M150 196H410" style={{ stroke: 'var(--heading)', strokeWidth: 2, fill: 'none' }} markerEnd="url(#drift-arrow)" />
      <text x="280" y="214" textAnchor="middle" className="diagram-label" style={heading}>
        the sky drifts across the detector
      </text>
    </Figure>
  )
}

/** A nearby star shifting against fixed background stars on a grid of SPHEREx pixels. */
export function MotionDiagram() {
  const cols = 6
  const rows = 3
  const size = 60
  const x0 = 110
  const y0 = 24
  // Barnard's Star: about 10″ a year ≈ 0.85 pixel every six months.
  const step = 0.85 * size
  const positions = [
    { x: x0 + 1.5 * size, label: 'May ’25' },
    { x: x0 + 1.5 * size + step, label: 'Nov ’25' },
    { x: x0 + 1.5 * size + 2 * step, label: 'May ’26' },
  ]
  return (
    <Figure
      height={236}
      label="Diagram: a grid of SPHEREx pixels with fixed background stars and a nearby star that moves a little to the right every six months."
      note={
        <>
          Distant stars look fixed, but nearby stars drift across them. Barnard’s Star moves about 10 arcseconds a year,
          under two SPHEREx pixels, so you need images months apart to see it. Use The Eyes to compare the
          star across observation dates.
        </>
      }
    >
      {Array.from({ length: cols + 1 }, (_, i) => (
        <line key={`v${i}`} x1={x0 + i * size} x2={x0 + i * size} y1={y0} y2={y0 + rows * size} style={{ stroke: 'var(--line)' }} />
      ))}
      {Array.from({ length: rows + 1 }, (_, i) => (
        <line key={`h${i}`} x1={x0} x2={x0 + cols * size} y1={y0 + i * size} y2={y0 + i * size} style={{ stroke: 'var(--line)' }} />
      ))}
      {[
        [x0 + 4.6 * size, y0 + 0.5 * size],
        [x0 + 5.5 * size, y0 + 2.6 * size],
        [x0 + 3.3 * size, y0 + 2.7 * size],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" style={muted} />
      ))}
      {positions.map((p, i) => (
        <g key={p.label}>
          <circle cx={p.x} cy={y0 + 1.5 * size} r="8" style={{ fill: 'var(--primary)', opacity: 0.35 + i * 0.32 }} />
          {/* The steps are drawn to scale, so the middle label goes above the star to keep the three apart. */}
          <text
            x={p.x}
            y={i === 1 ? y0 + 1.5 * size - 18 : y0 + rows * size + 24}
            textAnchor="middle"
            className="diagram-label"
          >
            {p.label}
          </text>
        </g>
      ))}
      <text x={x0 + cols * size} y="14" textAnchor="end" className="diagram-label">
        1 square = 1 SPHEREx pixel (6.15″)
      </text>
      <text x={x0 - 12} y={y0 + 1.5 * size + 5} textAnchor="end" className="diagram-label" style={ink}>
        nearby star
      </text>
    </Figure>
  )
}

/** First date minus later date: a moving star becomes a dark spot and a bright spot. */
export function DifferenceDiagram() {
  const cell = (x: number, label: string, children: ReactNode) => (
    <g transform={`translate(${x} 20)`}>
      <rect x="0" y="0" width="150" height="150" rx="4" fill="#000" stroke="#2A2A38" />
      {children}
      <text x="75" y="176" textAnchor="middle" className="diagram-label">
        {label}
      </text>
    </g>
  )
  return (
    <Figure
      label="Diagram: first observation, later observation, and their difference showing a dark spot where the star was and a bright spot where it is now"
      note={
        <>
          The Difference view subtracts the first date from a later one. Stars that stay put cancel out to grey. A star
          that moved leaves a dark spot where it was and a bright spot where it is now.
        </>
      }
    >
      {cell(
        0,
        'First date',
        <>
          <circle cx="40" cy="40" r="5" fill="#FFF3D6" />
          <circle cx="112" cy="104" r="4" fill="#FFF3D6" />
          <circle cx="70" cy="82" r="7" fill="#F4EF83" />
        </>,
      )}
      <text x="168" y="100" className="diagram-op">
        −
      </text>
      {cell(
        190,
        'Later date',
        <>
          <circle cx="40" cy="40" r="5" fill="#FFF3D6" />
          <circle cx="112" cy="104" r="4" fill="#FFF3D6" />
          <circle cx="82" cy="68" r="7" fill="#F4EF83" />
        </>,
      )}
      <text x="358" y="100" className="diagram-op">
        =
      </text>
      {cell(
        380,
        'Difference',
        <>
          <rect x="0" y="0" width="150" height="150" rx="4" fill="#808080" />
          <circle cx="70" cy="82" r="7" fill="#1a1a1a" />
          <circle cx="82" cy="68" r="7" fill="#ffffff" />
        </>,
      )}
    </Figure>
  )
}

/** Launch, survey start and a new all-sky map about every six months. */
export function SurveyTimeline() {
  const x = (months: number) => 50 + months * 22 // month 0 = March 2025
  // Launch and survey start are two months apart, so their labels sit on separate rows.
  const marks = [
    { m: 0, top: 'Launch', bottom: '11 Mar 2025', strong: false, topY: 60, bottomY: 164 },
    { m: 2, top: 'Survey starts', bottom: '1 May 2025', strong: false, topY: 84, bottomY: 142 },
    { m: 8, top: 'Map 1', bottom: '≈ Nov 2025', strong: true, topY: 84, bottomY: 142 },
    { m: 14, top: 'Map 2', bottom: '≈ May 2026', strong: true, topY: 84, bottomY: 142 },
    { m: 20, top: 'Map 3', bottom: '≈ Nov 2026', strong: true, topY: 84, bottomY: 142 },
  ]
  return (
    <Figure
      label="Timeline: SPHEREx launched on 11 March 2025, began its survey on 1 May 2025 and completes a full map of the sky about every six months."
      note={
        <>
          SPHEREx launched on 11 March 2025 and began its survey on 1 May 2025. It completes a map of the whole sky about
          every six months, so each target gets a few new dates per year. Map dates here are approximate.
        </>
      }
    >
      <line x1={x(0)} x2={x(20) + 20} y1="110" y2="110" style={{ stroke: 'var(--line-strong)', strokeWidth: 2 }} />
      <rect x={x(2)} y="104" width={x(20) - x(2)} height="12" rx="6" style={{ fill: 'var(--blue)', opacity: 0.35 }} />
      {marks.map((k) => (
        <g key={k.top}>
          <circle cx={x(k.m)} cy="110" r={k.strong ? 9 : 6} style={{ fill: k.strong ? 'var(--primary)' : 'var(--fg)' }} />
          <text x={x(k.m)} y={k.topY} textAnchor="middle" className="diagram-label" style={k.strong ? heading : ink}>
            {k.top}
          </text>
          <text x={x(k.m)} y={k.bottomY} textAnchor="middle" className="diagram-label">
            {k.bottom}
          </text>
        </g>
      ))}
      <text x={(x(2) + x(20)) / 2} y="200" textAnchor="middle" className="diagram-label" style={heading}>
        a new all-sky map about every six months
      </text>
    </Figure>
  )
}
