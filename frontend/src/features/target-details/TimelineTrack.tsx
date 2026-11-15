import { analyzeTimeline, frameBand, frameMission } from './timeline'
import type { Frame } from '../../shared/api/types'
import { formatShortDate } from './format'

interface Props {
  frames: readonly Frame[]
  activeIndex: number
  compareIndices?: [number, number] | null
  detector?: number
  onSelect: (index: number) => void
}

export function TimelineTrack({ frames, activeIndex, compareIndices, detector, onSelect }: Props) {
  if (frames.length === 0) return null
  const summary = analyzeTimeline(frames, detector)

  return (
    <div className="timeline-viz" aria-label="Observation timeline by mission and date">
      <div className="timeline-viz__legend">
        {summary.missions.map((m) => (
          <span key={`${m.mission}-${m.band}`} className={`mission-pill mission-pill--${m.mission.toLowerCase()}`}>
            <span className="mission-pill__dot" aria-hidden />
            <span>
              {m.mission} {m.band} ({m.count})
            </span>
          </span>
        ))}
        {summary.gaps.map((g) => (
          <span key={`${g.fromIndex}-${g.toIndex}`} className="gap-pill" title={`Gap between ${frames[g.fromIndex]?.iso.slice(0, 10)} and ${frames[g.toIndex]?.iso.slice(0, 10)}`}>
            {g.label}
          </span>
        ))}
      </div>

      <div className="timeline-axis" role="group" aria-label="Observation dates">
        <div className="timeline-axis__rail" aria-hidden />
        {summary.gaps.map((g) => {
          const left = g.startPos * 100
          const width = Math.max(2, (g.endPos - g.startPos) * 100)
          return (
            <div
              key={`gap-${g.fromIndex}-${g.toIndex}`}
              className="timeline-axis__gap"
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${g.label} between observations`}
            >
              <span className="timeline-axis__gap-label">{g.label}</span>
            </div>
          )
        })}
        {summary.points.map((pt) => {
          const isCurrent = pt.index === activeIndex
          const isA = compareIndices?.[0] === pt.index
          const isB = compareIndices?.[1] === pt.index
          const mission = frameMission(frames[pt.index])
          const band = frameBand(frames[pt.index], detector)
          return (
            <button
              key={frames[pt.index].id}
              type="button"
              className={`timeline-dot timeline-dot--${mission.toLowerCase()}${isCurrent ? ' is-current' : ''}${isA ? ' is-a' : ''}${isB ? ' is-b' : ''}`}
              style={{ left: `${pt.pos * 100}%` }}
              aria-label={`Jump to ${pt.dateLabel}, ${mission} ${band}${isA ? ' (Image A)' : ''}${isB ? ' (Image B)' : ''}`}
              aria-pressed={isCurrent}
              title={`${pt.dateLabel} · ${mission} ${band}`}
              onClick={() => onSelect(pt.index)}
            />
          )
        })}
      </div>

      <div className="timeline-axis__dates caption num" aria-hidden>
        <span>{formatShortDate(summary.mjdMin)}</span>
        <span>{formatShortDate(summary.mjdMax)}</span>
      </div>
    </div>
  )
}
