import { useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import type { BehaviorSegment } from '../api/types'
import { buildColorMap, formatSeconds, summarizeTimeline } from '../lib/behaviors'
import { behaviorInfo } from '../lib/behaviorInfo'
import { LOW_CONFIDENCE } from '../lib/boutStats'
import { pickSegment } from '../lib/ribbon'
import { percent } from '../lib/summary'

/** Opt-in (Summary view): hover readout and highlighting linked to the rest of the card. */
export interface RibbonInteraction {
  /** The behavior highlighted anywhere in the card, or null. */
  readonly active: string | null
  readonly onActiveChange: (label: string | null) => void
}

interface TimelineRibbonProps {
  readonly segments: readonly BehaviorSegment[]
  /** Sweep the segments in left to right (Summary view). */
  readonly animate?: boolean
  readonly interactive?: RibbonInteraction
  /** Detail view: hatch segments the model is unsure about (below LOW_CONFIDENCE). */
  readonly hatchLowConfidence?: boolean
  /** Rendered between the strip and its time axis (Detail view: the confidence lane). */
  readonly belowStrip?: ReactNode
}

const TICKS = 4 // five time labels: start, quarters, end

/** The colored time strip with its axis; shared by the Detail view (plain) and the Summary (interactive). */
export function TimelineRibbon({ segments, animate = false, interactive, hatchLowConfidence = false, belowStrip }: TimelineRibbonProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const { duration, totals } = summarizeTimeline(segments)
  const colors = buildColorMap(segments.map((s) => s.behavior_label))
  const origin = Math.min(...segments.map((s) => s.start_time))
  const span = duration || 1

  const active = interactive?.active ?? null
  const hoveredSegment = hovered !== null ? segments[hovered] : null
  const tipCenter = hoveredSegment
    ? Math.min(Math.max(((hoveredSegment.start_time + hoveredSegment.end_time) / 2 - origin) / span, 0.1), 0.9) * 100
    : 0

  // Pointer position -> segment (see lib/ribbon.ts); only when interactive.
  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!interactive) return
    const rect = event.currentTarget.getBoundingClientRect()
    const spans = segments.map((s) => ({
      start: ((s.start_time - origin) / span) * rect.width,
      end: ((s.end_time - origin) / span) * rect.width,
    }))
    const index = pickSegment(event.clientX - rect.left, spans)
    if (index !== hovered) {
      setHovered(index)
      interactive.onActiveChange(index === null ? null : segments[index].behavior_label)
    }
  }

  function handlePointerLeave() {
    if (!interactive) return
    setHovered(null)
    interactive.onActiveChange(null)
  }

  const strip = (
    <div
      className={`timeline${animate ? ' timeline--animate' : ''}${interactive ? ' timeline--interactive' : ''}`}
      role="img"
      aria-label={`Behavior timeline, ${formatSeconds(duration)} long: ${totals.map((t) => `${t.label} ${percent(t.share)}`).join(', ')}`}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerLeave={interactive ? handlePointerLeave : undefined}
    >
      {segments.map((s, i) => {
        const opacity = 0.45 + 0.55 * s.confidence
        const style = {
          left: percent((s.start_time - origin) / span),
          width: percent((s.end_time - s.start_time) / span),
          background: colors[s.behavior_label],
          ...(interactive ? { ['--beh' as string]: colors[s.behavior_label], ['--c' as string]: opacity } : { opacity }),
        } as CSSProperties
        const state = interactive
          ? `${hovered === i ? ' is-hover' : ''}${active === s.behavior_label ? ' is-active' : ''}${active && active !== s.behavior_label ? ' is-dim' : ''}`
          : ''
        return (
          <div
            key={`${s.start_time}-${s.behavior_label}`}
            className={`timeline__segment${state}${hatchLowConfidence && s.confidence < LOW_CONFIDENCE ? ' is-low' : ''}`}
            title={
              interactive
                ? undefined // the Summary shows its own readout
                : `${s.behavior_label} ${formatSeconds(s.start_time)}–${formatSeconds(s.end_time)} (${percent(s.confidence)})`
            }
            style={style}
          />
        )
      })}
    </div>
  )

  if (!interactive) {
    return (
      <>
        {strip}
        {belowStrip}
        <div className="timeline__axis muted">
          <span>{formatSeconds(origin)}</span>
          <span>{formatSeconds(origin + duration)}</span>
        </div>
      </>
    )
  }

  return (
    <div className="timeline-wrap">
      {strip}
      {hoveredSegment && (
        <span className="tip tip--ribbon tip--on" role="tooltip" style={{ left: `${tipCenter}%`, ['--beh' as string]: colors[hoveredSegment.behavior_label] } as CSSProperties}>
          <strong>{behaviorInfo(hoveredSegment.behavior_label).title}</strong> {formatSeconds(hoveredSegment.start_time)}–{formatSeconds(hoveredSegment.end_time)} · {percent(hoveredSegment.confidence)} confident
        </span>
      )}
      <div className="timeline__axis timeline__axis--ticks muted" aria-hidden="true">
        {Array.from({ length: TICKS + 1 }, (_, k) => (
          <span key={k}>{formatSeconds(origin + (duration * k) / TICKS)}</span>
        ))}
      </div>
    </div>
  )
}
