import type { BehaviorSegment } from '../api/types'
import { buildColorMap, formatSeconds, summarizeTimeline } from '../lib/behaviors'

interface BehaviorTimelineProps {
  readonly segments: readonly BehaviorSegment[]
}

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`

export function BehaviorTimeline({ segments }: BehaviorTimelineProps) {
  if (segments.length === 0) {
    return <p className="empty">No behaviors detected in this video.</p>
  }

  const { duration, totals } = summarizeTimeline(segments)
  const colors = buildColorMap(segments.map((s) => s.behavior_label))
  const origin = Math.min(...segments.map((s) => s.start_time))

  return (
    <section className="result" aria-label="Predicted behavior timeline">
      <ul className="legend">
        {totals.map((t) => (
          <li key={t.label}>
            <span className="swatch" style={{ background: colors[t.label] }} aria-hidden="true" />
            {t.label} <span className="muted">{percent(t.share)} of time</span>
          </li>
        ))}
      </ul>

      <div
        className="timeline"
        role="img"
        aria-label={`Behavior timeline, ${formatSeconds(duration)} long: ${totals.map((t) => `${t.label} ${percent(t.share)}`).join(', ')}`}
      >
        {segments.map((s) => (
          <div
            key={`${s.start_time}-${s.behavior_label}`}
            className="timeline__segment"
            title={`${s.behavior_label} ${formatSeconds(s.start_time)}–${formatSeconds(s.end_time)} (${percent(s.confidence)})`}
            style={{
              left: percent((s.start_time - origin) / (duration || 1)),
              width: percent((s.end_time - s.start_time) / (duration || 1)),
              background: colors[s.behavior_label],
              opacity: 0.45 + 0.55 * s.confidence,
            }}
          />
        ))}
      </div>
      <div className="timeline__axis muted">
        <span>{formatSeconds(origin)}</span>
        <span>{formatSeconds(origin + duration)}</span>
      </div>

      <table className="data-table" aria-label="Predicted segments">
        <thead>
          <tr>
            <th scope="col">Start</th>
            <th scope="col">End</th>
            <th scope="col">Behavior</th>
            <th scope="col" className="num">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s) => (
            <tr key={`${s.start_time}-${s.behavior_label}`}>
              <td>{formatSeconds(s.start_time)}</td>
              <td>{formatSeconds(s.end_time)}</td>
              <td>
                <span className="swatch" style={{ background: colors[s.behavior_label] }} aria-hidden="true" />
                <span>{s.behavior_label}</span>
              </td>
              <td className="num">{percent(s.confidence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
