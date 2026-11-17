/**
 * Small explanatory diagrams for the Story page. Plain SVG, colours from the design tokens
 * (CSS variables are applied through `style`, since SVG presentation attributes cannot read them).
 * Every number here is already stated on the page or in shared/config/targets.ts.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'

const ink: CSSProperties = { fill: 'var(--fg)' }
const muted: CSSProperties = { fill: 'var(--muted)' }
const heading: CSSProperties = { fill: 'var(--heading)' }
const line: CSSProperties = { stroke: 'var(--line-strong)', fill: 'none' }

function Figure({
  label,
  note,
  height = 220,
  controls,
  children,
}: {
  label: string
  note: ReactNode
  height?: number
  /** Buttons or a slider under the drawing that change it. */
  controls?: ReactNode
  children: ReactNode
}) {
  return (
    <figure className="diagram">
      <svg viewBox={`0 0 560 ${height}`} role="img" aria-label={label}>
        {children}
      </svg>
      {controls && <div className="diagram-controls">{controls}</div>}
      <figcaption className="diagram-note">
        <strong>Note:</strong> {note}
      </figcaption>
    </figure>
  )
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented diagram-choice" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Steps through `count` states on a timer while playing; never plays under reduced motion. */
function useStepper(count: number, ms: number) {
  const reduce = useReducedMotion()
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing || reduce) return
    const t = window.setInterval(() => setI((v) => (v + 1) % count), ms)
    return () => window.clearInterval(t)
  }, [playing, reduce, count, ms])
  const pick = (v: number) => {
    setPlaying(false)
    setI(v)
  }
  return { i, pick, playing: playing && !reduce, setPlaying, canPlay: !reduce }
}

/** One detector with a filter whose colour changes along it; a star crossing it is seen in many colours. */
export function ColourDiagram() {
  const stars = [
    { x: 150, label: 'Exposure 1', colour: 'var(--blue)', um: 'shorter wavelength' },
    { x: 280, label: 'Exposure 2', colour: 'var(--pink)', um: 'middle wavelength' },
    { x: 410, label: 'Exposure 3', colour: 'var(--primary)', um: 'longer wavelength' },
  ]
  const { i, pick, playing, setPlaying, canPlay } = useStepper(stars.length, 1100)
  return (
    <Figure
      controls={
        <>
          <Choice label="Exposure" value={i} options={stars.map((s, k) => ({ value: k, label: s.label }))} onChange={pick} />
          {canPlay && (
            <button type="button" className="btn btn-secondary btn--compact" aria-pressed={playing} onClick={() => setPlaying(!playing)}>
              {playing ? 'Pause' : 'Play the drift'}
            </button>
          )}
          <span className="caption" aria-live="polite">
            {stars[i].label}: the same star is seen at a <strong style={{ color: stars[i].colour }}>{stars[i].um}</strong>.
          </span>
        </>
      }
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
      {stars.map((s, k) => (
        <g key={s.label} className="diagram-hit" onClick={() => pick(k)}>
          <circle
            cx={s.x}
            cy="92"
            r={k === i ? 14 : 9}
            className="diagram-anim"
            style={{ fill: 'var(--fg)', opacity: k === i ? 1 : 0.3, stroke: k === i ? s.colour : 'none', strokeWidth: 4 }}
          />
          <text x={s.x} y="166" textAnchor="middle" className="diagram-label" style={k === i ? heading : undefined}>
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
  const { i, pick, playing, setPlaying, canPlay } = useStepper(positions.length, 700)
  return (
    <Figure
      height={236}
      controls={
        <>
          <Choice label="Observation date" value={i} options={positions.map((p, k) => ({ value: k, label: p.label }))} onChange={pick} />
          {canPlay && (
            <button type="button" className="btn btn-secondary btn--compact" aria-pressed={playing} onClick={() => setPlaying(!playing)}>
              {playing ? 'Pause' : 'Blink the dates'}
            </button>
          )}
        </>
      }
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
      {positions.map((p, k) => (
        <g key={p.label} className="diagram-hit" onClick={() => pick(k)}>
          <circle cx={p.x} cy={y0 + 1.5 * size} r={k === i ? 10 : 6} className="diagram-anim" style={{ fill: 'var(--primary)', opacity: k === i ? 1 : 0.2 }} />
          {/* The steps are drawn to scale, so the middle label goes above the star to keep the three apart. */}
          <text
            x={p.x}
            y={k === 1 ? y0 + 1.5 * size - 18 : y0 + rows * size + 24}
            textAnchor="middle"
            className="diagram-label"
            style={k === i ? heading : undefined}
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
  // How far the star has moved by the later date: 0 = not at all, 1 = the full step drawn here.
  const [shift, setShift] = useState(1)
  const lx = 70 + 12 * shift
  const ly = 82 - 14 * shift
  const strength = Math.min(1, shift * 1.6)
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
      controls={
        <label className="diagram-slider">
          <span>How far the star moved</span>
          <input type="range" min={0} max={1} step={0.05} value={shift} onChange={(e) => setShift(Number(e.target.value))} />
          <span className="caption" aria-live="polite">
            {shift === 0 ? 'No motion: the difference is flat grey.' : 'Moved: a dark spot where it was and a bright spot where it is now.'}
          </span>
        </label>
      }
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
          <circle cx={lx} cy={ly} r="7" fill="#F4EF83" />
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
          <circle cx="70" cy="82" r="7" fill="#1a1a1a" opacity={strength} />
          <circle cx={lx} cy={ly} r="7" fill="#ffffff" opacity={strength} />
        </>,
      )}
    </Figure>
  )
}

/** Launch, survey start and a new all-sky map about every six months. */
export function SurveyTimeline() {
  // Position Launch clearly to the left of Survey starts so all five labels align on clean horizontal rows.
  const marks = [
    { x: 56, top: 'Launch', bottom: '11 Mar 2025', strong: false, info: 'SPHEREx launched on 11 March 2025.' },
    { x: 152, top: 'Survey starts', bottom: '1 May 2025', strong: false, info: 'Science observations began on 1 May 2025.' },
    { x: 264, top: 'Map 1', bottom: '≈ Nov 2025', strong: true, info: 'The first full map of the sky: every target gets its first date.' },
    { x: 376, top: 'Map 2', bottom: '≈ May 2026', strong: true, info: 'A second date per target, enough to blink and compare.' },
    { x: 488, top: 'Map 3', bottom: '≈ Nov 2026', strong: true, info: 'A year after Map 1, so slow movers like Barnard’s Star shift visibly.' },
  ]
  const [sel, setSel] = useState(2)
  return (
    <Figure
      controls={
        <p className="caption diagram-info" aria-live="polite">
          <strong>{marks[sel].top}:</strong> {marks[sel].info} <span className="diagram-hint">Click a dot on the timeline.</span>
        </p>
      }
      label="Timeline: SPHEREx launched on 11 March 2025, began its survey on 1 May 2025 and completes a full map of the sky about every six months."
      note={
        <>
          SPHEREx launched on 11 March 2025 and began its survey on 1 May 2025. It completes a map of the whole sky about
          every six months, so each target gets a few new dates per year. Map dates here are approximate.
        </>
      }
    >
      <line x1={marks[0].x} x2={marks[4].x + 20} y1="110" y2="110" style={{ stroke: 'var(--line-strong)', strokeWidth: 2 }} />
      <rect x={marks[1].x} y="104" width={marks[4].x - marks[1].x} height="12" rx="6" style={{ fill: 'var(--blue)', opacity: 0.35 }} />
      {marks.map((k, idx) => (
        <g
          key={k.top}
          className="diagram-hit"
          role="button"
          tabIndex={0}
          aria-label={`${k.top}, ${k.bottom}`}
          aria-pressed={sel === idx}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setSel(idx)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setSel(idx)
            }
          }}
        >
          <circle cx={k.x} cy="110" r="18" fill="transparent" />
          <circle
            cx={k.x}
            cy="110"
            r={(k.strong ? 9 : 6) + (sel === idx ? 4 : 0)}
            className="diagram-anim diagram-dot"
            style={{ fill: k.strong ? 'var(--primary)' : 'var(--fg)', stroke: sel === idx ? 'var(--heading)' : 'none', strokeWidth: 3 }}
          />
          <text x={k.x} y={84} textAnchor="middle" className="diagram-label" style={k.strong ? heading : ink}>
            {k.top}
          </text>
          <text x={k.x} y={142} textAnchor="middle" className="diagram-label">
            {k.bottom}
          </text>
        </g>
      ))}
      <text x={(marks[1].x + marks[4].x) / 2} y="190" textAnchor="middle" className="diagram-label" style={heading}>
        a new all-sky map about every six months
      </text>
    </Figure>
  )
}
