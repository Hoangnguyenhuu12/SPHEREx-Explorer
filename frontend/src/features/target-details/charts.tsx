/** Small SVG charts with error bars. Values come only from API (or labelled mock) responses. */

export interface ChartPoint {
  x: number
  y: number | null
  err?: number | null
  flagged?: boolean
  active?: boolean
  label: string
}

export interface ChartBand {
  xMin: number
  xMax: number
  label: string
}

interface Props {
  points: ChartPoint[]
  xLabel: string
  yLabel: string
  formatX?: (x: number) => string
  height?: number
  title: string
  bands?: ChartBand[]
}

const W = 400
const PAD = { l: 52, r: 12, t: 12, b: 40 }

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min]
  const span = max - min
  const step = 10 ** Math.floor(Math.log10(span / count))
  const err = (count / span) * step
  const mult = err <= 0.15 ? 10 : err <= 0.35 ? 5 : err <= 0.75 ? 2 : 1
  const s = step * mult
  const ticks: number[] = []
  for (let v = Math.ceil(min / s) * s; v <= max + 1e-9; v += s) ticks.push(+v.toFixed(10))
  return ticks
}

export function ErrorBarChart({ points, xLabel, yLabel, formatX = (x) => x.toFixed(2), height = 220, title, bands }: Props) {
  const valid = points.filter((p) => p.y != null) as (ChartPoint & { y: number })[]
  const H = height
  if (valid.length === 0) {
    return <p className="chart-empty">No measured values to plot.</p>
  }
  const xs = points.map((p) => p.x)
  const lo = Math.min(...valid.map((p) => p.y - (p.err ?? 0)))
  const hi = Math.max(...valid.map((p) => p.y + (p.err ?? 0)))
  const padY = (hi - lo || Math.abs(hi) || 1) * 0.12
  const y0 = lo - padY
  const y1 = hi + padY
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const padX = (x1 - x0 || 1) * 0.06
  const sx = (x: number) => PAD.l + ((x - (x0 - padX)) / (x1 - x0 + 2 * padX)) * (W - PAD.l - PAD.r)
  const sy = (y: number) => PAD.t + (1 - (y - y0) / (y1 - y0)) * (H - PAD.t - PAD.b)
  const yTicks = niceTicks(y0, y1)
  const plotLeft = PAD.l
  const plotRight = W - PAD.r
  const visibleBands = (bands ?? []).flatMap((b) => {
    if (b.xMax < x0 - padX || b.xMin > x1 + padX) return []
    const rx0 = Math.max(plotLeft, Math.min(plotRight, sx(b.xMin)))
    const rx1 = Math.max(plotLeft, Math.min(plotRight, sx(b.xMax)))
    if (rx1 <= rx0) return []
    return [{ ...b, rx0, rx1 }]
  })

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {visibleBands.map((b, idx) => (
          <g key={`${b.label}-${idx}`}>
            <rect x={b.rx0} y={PAD.t} width={Math.max(2, b.rx1 - b.rx0)} height={H - PAD.t - PAD.b} className="chart-band-bg" />
            <text x={(b.rx0 + b.rx1) / 2} y={PAD.t + 12} textAnchor="middle" className="chart-band-label">
              {b.label}
            </text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(t)} y2={sy(t)} className="chart-grid" />
            <text x={PAD.l - 6} y={sy(t) + 4} textAnchor="end" className="chart-tick">
              {+t.toPrecision(4)}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={i} x={sx(p.x)} y={H - PAD.b + 16} textAnchor="middle" className="chart-tick">
            {formatX(p.x)}
          </text>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" className="chart-axis">
          {xLabel}
        </text>
        <text x={12} y={(PAD.t + H - PAD.b) / 2} textAnchor="middle" className="chart-axis" transform={`rotate(-90 12 ${(PAD.t + H - PAD.b) / 2})`}>
          {yLabel}
        </text>
        <polyline
          className="chart-line"
          points={valid
            .slice()
            .sort((a, b) => a.x - b.x)
            .map((p) => `${sx(p.x)},${sy(p.y)}`)
            .join(' ')}
        />
        {valid.map((p, i) => (
          <g key={i}>
            {p.err ? <line x1={sx(p.x)} x2={sx(p.x)} y1={sy(p.y - p.err)} y2={sy(p.y + p.err)} className="chart-err" /> : null}
            <circle
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={p.active ? 6 : 4}
              className={`chart-dot${p.flagged ? ' is-flagged' : ''}${p.active ? ' is-active' : ''}`}
            >
              <title>{p.label}</title>
            </circle>
          </g>
        ))}
      </svg>
    </figure>
  )
}

interface XYPoint {
  x: number
  y: number
  err?: number
  kind: 'measured'
  active?: boolean
  label: string
}

/** Sky-plane offsets (arcsec): east to the left, north up. */
export function OffsetChart({ points, title }: { points: XYPoint[]; title: string }) {
  const H = 260
  if (!points.length) return <p className="chart-empty">No positions to plot.</p>
  const ext = Math.max(1, ...points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)) + (p.err ?? 0))) * 1.25
  const cx = (PAD.l + W - PAD.r) / 2
  const cy = (PAD.t + H - PAD.b) / 2
  const r = Math.min(W - PAD.l - PAD.r, H - PAD.t - PAD.b) / 2
  const k = r / ext
  // East is left on the sky: positive east offset → negative screen x.
  const sx = (x: number) => cx - x * k
  const sy = (y: number) => cy - y * k
  const line = (kind: XYPoint['kind']) =>
    points
      .filter((p) => p.kind === kind)
      .map((p) => `${sx(p.x)},${sy(p.y)}`)
      .join(' ')
  const tick = +(ext / 2).toPrecision(2)
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        <line x1={cx - r} x2={cx + r} y1={cy} y2={cy} className="chart-grid" />
        <line x1={cx} x2={cx} y1={cy - r} y2={cy + r} className="chart-grid" />
        <text x={cx} y={cy - r - 2} textAnchor="middle" className="chart-tick">N</text>
        <text x={cx - r - 4} y={cy + 4} textAnchor="end" className="chart-tick">E</text>
        <line x1={cx + r - tick * k} x2={cx + r} y1={cy + r - 6} y2={cy + r - 6} className="chart-scale" />
        <text x={cx + r - (tick * k) / 2} y={cy + r + 8} textAnchor="middle" className="chart-tick">{tick}″</text>
        <polyline points={line('measured')} className="chart-line" />
        {points.map((p, i) => (
          <g key={i}>
            {p.err && p.kind === 'measured' ? <circle cx={sx(p.x)} cy={sy(p.y)} r={p.err * k} className="chart-errcircle" /> : null}
            <circle cx={sx(p.x)} cy={sy(p.y)} r={p.active ? 6 : 4} className={`chart-dot${p.active ? ' is-active' : ''}`}>
              <title>{p.label}</title>
            </circle>
          </g>
        ))}
      </svg>
    </figure>
  )
}
