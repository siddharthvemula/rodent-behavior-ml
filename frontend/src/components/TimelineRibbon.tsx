import type { BehaviorSegment } from '../api/types'
import { buildColorMap, formatSeconds, summarizeTimeline } from '../lib/behaviors'
import { percent } from '../lib/summary'

interface TimelineRibbonProps {
  readonly segments: readonly BehaviorSegment[]
  /** Sweep the segments in left to right (Summary view). */
  readonly animate?: boolean
}

/** The colored time strip with its start/end axis; shared by the Detail and Summary views. */
export function TimelineRibbon({ segments, animate = false }: TimelineRibbonProps) {
  const { duration, totals } = summarizeTimeline(segments)
  const colors = buildColorMap(segments.map((s) => s.behavior_label))
  const origin = Math.min(...segments.map((s) => s.start_time))

  return (
    <>
      <div
        className={`timeline${animate ? ' timeline--animate' : ''}`}
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
    </>
  )
}
