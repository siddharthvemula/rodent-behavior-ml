import type { BehaviorSegment } from '../api/types'
import { buildColorMap, formatSeconds, summarizeTimeline } from '../lib/behaviors'
import { BoutStats } from './BoutStats'
import { ConfidenceLane } from './ConfidenceLane'
import { ModelTrust } from './ModelTrust'
import { TimelineRibbon } from './TimelineRibbon'

interface BehaviorTimelineProps {
  readonly segments: readonly BehaviorSegment[]
}

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`

export function BehaviorTimeline({ segments }: BehaviorTimelineProps) {
  if (segments.length === 0) {
    return <p className="empty">No behaviors detected in this video.</p>
  }

  const { totals } = summarizeTimeline(segments)
  const colors = buildColorMap(segments.map((s) => s.behavior_label))

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

      <TimelineRibbon segments={segments} hatchLowConfidence belowStrip={<ConfidenceLane segments={segments} />} />

      <BoutStats segments={segments} />

      <ModelTrust />

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
