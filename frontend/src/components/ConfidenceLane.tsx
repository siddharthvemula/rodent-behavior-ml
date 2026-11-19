import { useState, type CSSProperties, type PointerEvent } from 'react'
import type { BehaviorSegment } from '../api/types'
import { buildColorMap, formatSeconds } from '../lib/behaviors'
import { behaviorInfo } from '../lib/behaviorInfo'
import { confidenceProfile, LOW_CONFIDENCE } from '../lib/boutStats'
import { pickSegment } from '../lib/ribbon'
import { percent } from '../lib/summary'

interface ConfidenceLaneProps {
  readonly segments: readonly BehaviorSegment[]
}

/**
 * Model confidence over time, one bar per segment, drawn on the same x-scale as
 * the ribbon directly above it. Bar height = the segment's confidence; bars
 * keep the behavior's color so the two strips read as one figure.
 */
export function ConfidenceLane({ segments }: ConfidenceLaneProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  if (segments.length === 0) return null

  const origin = Math.min(...segments.map((s) => s.start_time))
  const end = Math.max(...segments.map((s) => s.end_time))
  const span = end - origin || 1
  const colors = buildColorMap(segments.map((s) => s.behavior_label))
  const profile = confidenceProfile(segments)
  const lowest = profile.lowest

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const spans = segments.map((s) => ({
      start: ((s.start_time - origin) / span) * rect.width,
      end: ((s.end_time - origin) / span) * rect.width,
    }))
    const index = pickSegment(event.clientX - rect.left, spans)
    if (index !== hovered) setHovered(index)
  }

  const tipped = hovered !== null ? segments[hovered] : null
  const tipCenter = tipped
    ? Math.min(Math.max(((tipped.start_time + tipped.end_time) / 2 - origin) / span, 0.12), 0.88) * 100
    : 0

  const summary =
    profile.lowSegments === 0
      ? `Every segment is at ${percent(LOW_CONFIDENCE)} confidence or higher.`
      : `${percent(profile.highShare)} of the recording is at ${percent(LOW_CONFIDENCE)} confidence or higher; ${profile.lowSegments} ${profile.lowSegments === 1 ? 'segment is' : 'segments are'} less certain (hatched above).`

  return (
    <div className="conf-lane">
      <div className="conf-lane__head">
        <span className="conf-lane__title">Model confidence</span>
        <span className="muted small conf-lane__summary">{summary}</span>
        <span className="muted small conf-lane__key" aria-hidden="true">
          <span className="conf-lane__key-line" /> {percent(LOW_CONFIDENCE)} line
        </span>
      </div>
      <div
        className="conf-lane__plot"
        role="img"
        aria-label={`Confidence over time. Average ${percent(profile.mean)}. ${summary}${lowest ? ` Least certain: ${behaviorInfo(lowest.behavior_label).title} at ${formatSeconds(lowest.start_time)}, ${percent(lowest.confidence)}.` : ''}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHovered(null)}
      >
        <div className="conf-lane__threshold" style={{ bottom: `${LOW_CONFIDENCE * 100}%` }} />
        {segments.map((s, i) => (
          <div
            key={`${s.start_time}-${s.behavior_label}`}
            className={`conf-lane__bar${s.confidence < LOW_CONFIDENCE ? ' is-low' : ''}${hovered === i ? ' is-hover' : ''}`}
            style={
              {
                left: percent((s.start_time - origin) / span),
                width: percent((s.end_time - s.start_time) / span),
                ['--h' as string]: `${Math.max(0, Math.min(1, s.confidence)) * 100}%`,
                ['--beh' as string]: colors[s.behavior_label],
              } as CSSProperties
            }
          />
        ))}
        {tipped && (
          <span className="conf-lane__tip" role="tooltip" style={{ left: `${tipCenter}%` }}>
            <strong>{behaviorInfo(tipped.behavior_label).title}</strong> {formatSeconds(tipped.start_time)}–{formatSeconds(tipped.end_time)} · {percent(tipped.confidence)} confident
          </span>
        )}
      </div>
    </div>
  )
}
