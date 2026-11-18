import type { CSSProperties, ReactNode } from 'react'
import type { BehaviorSegment } from '../api/types'
import { buildColorMap, formatSeconds, summarizeTimeline } from '../lib/behaviors'
import { behaviorInfo, capitalize } from '../lib/behaviorInfo'
import { formatDuration, percent, summarizeRecording } from '../lib/summary'
import { useCountUp } from '../lib/useCountUp'
import { AnimatedPercent } from './AnimatedPercent'
import { BehaviorChip } from './BehaviorIcon'
import { Hero } from './Hero'
import { TimelineRibbon } from './TimelineRibbon'

interface TimelineSummaryProps {
  readonly segments: readonly BehaviorSegment[]
  readonly onShowDetail?: () => void
}

const STAGGER_MS = 110
const BAR_START_MS = 250

function Tile({ label, children, hint }: { readonly label: string; readonly children: ReactNode; readonly hint?: string }) {
  return (
    <div className="tile">
      <span className="tile__label">{label}</span>
      <span className="tile__value">{children}</span>
      {hint && <span className="tile__hint muted">{hint}</span>}
    </div>
  )
}

function Count({ value }: { readonly value: number }) {
  return <>{Math.round(useCountUp(value, 900, BAR_START_MS))}</>
}

/** Plain-language finding, key numbers, and animated share-of-time bars for one recording. */
export function TimelineSummary({ segments, onShowDetail }: TimelineSummaryProps) {
  const summary = summarizeRecording(segments)
  if (!summary) return <p className="empty">No behaviors detected in this recording.</p>

  const { totals } = summarizeTimeline(segments)
  const colors = buildColorMap(segments.map((s) => s.behavior_label))
  const leadInfo = behaviorInfo(summary.longest.label)
  const topShare = totals[0].share
  const scaleMax = Math.max(0.1, Math.ceil(topShare * 10) / 10)

  return (
    <section className="summary" aria-label="Summary of this recording">
      <Hero
        label={summary.leadLabel}
        color={colors[summary.leadLabel]}
        eyebrow="Key finding"
        headline={summary.headline}
        context={summary.context}
      >
        {summary.headline}
      </Hero>

      <div className="tiles">
        <Tile label="Recording length">{formatDuration(summary.duration)}</Tile>
        <Tile label="Behavior segments"><Count value={summary.segmentCount} /></Tile>
        <Tile label="Average confidence"><AnimatedPercent value={summary.meanConfidence} delayMs={BAR_START_MS} /></Tile>
        <Tile
          label="Longest stretch"
          hint={`${capitalize(leadInfo.gerund)}, ${formatSeconds(summary.longest.start)}–${formatSeconds(summary.longest.end)}`}
        >
          {formatDuration(summary.longest.seconds)}
        </Tile>
      </div>

      <div className="chart-card">
        <header className="chart-card__header">
          <div>
            <h3>Where the time went</h3>
            <p className="muted small">Share of the recording spent on each behavior</p>
          </div>
        </header>
        <ul className="pairs">
          {totals.map((t, i) => {
            const info = behaviorInfo(t.label)
            const delay = BAR_START_MS + i * STAGGER_MS
            const style = { ['--beh' as string]: colors[t.label], ['--p' as string]: (Math.min(t.share, scaleMax) / scaleMax) * 100, ['--d' as string]: `${delay}ms` } as CSSProperties
            return (
              <li key={t.label} className="pair pair--single" tabIndex={0} aria-label={`${info.title}: ${percent(t.share)} of the recording, ${t.seconds.toFixed(1)} seconds`} style={style}>
                <div className="pair__inner" aria-hidden="true">
                  <div className="pair__name">
                    <BehaviorChip label={t.label} color={colors[t.label]} />
                    <div>
                      <strong>{info.title}</strong>
                      {info.description && <span className="muted small">{info.description}</span>}
                    </div>
                  </div>
                  <div className="pair__bars">
                    <div className="bar-lane bar-lane--treated">
                      <div className="bar-fill" />
                      <span className="bar-value"><AnimatedPercent value={t.share} delayMs={delay} /></span>
                      <span className="tip" role="tooltip"><strong>{t.seconds.toFixed(1)} s</strong> of {formatSeconds(summary.duration)}</span>
                    </div>
                  </div>
                  <div className="pair__delta"><span className="delta delta--flat">{t.seconds.toFixed(1)} s</span></div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="chart-card">
        <header className="chart-card__header">
          <div>
            <h3>Behavior over time</h3>
            <p className="muted small">Each block is one detected segment; fainter blocks are less certain</p>
          </div>
        </header>
        <TimelineRibbon segments={segments} animate />
      </div>

      {onShowDetail && (
        <button type="button" className="link-button" onClick={onShowDetail}>
          See every segment with timestamps and confidence in the Detail view →
        </button>
      )}
    </section>
  )
}
