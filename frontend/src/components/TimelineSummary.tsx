import { useState, type CSSProperties, type ReactNode } from 'react'
import type { BehaviorSegment } from '../api/types'
import { buildColorMap, formatSeconds, summarizeTimeline } from '../lib/behaviors'
import { behaviorInfo, capitalize } from '../lib/behaviorInfo'
import { barDelay, HERO_COUNT_MS, rowDelay } from '../lib/motion'
import { formatDuration, percent, summarizeRecording } from '../lib/summary'
import { useCountUp } from '../lib/useCountUp'
import { AnimatedPercent } from './AnimatedPercent'
import { BehaviorChip } from './BehaviorIcon'
import { Donut } from './Donut'
import { Hero, HeroStat } from './Hero'
import { TimelineRibbon } from './TimelineRibbon'

interface TimelineSummaryProps {
  readonly segments: readonly BehaviorSegment[]
  readonly onShowDetail?: () => void
}

const enter = (step: number) => ({ ['--s' as string]: step }) as CSSProperties

function Tile({ label, children, hint, step }: { readonly label: string; readonly children: ReactNode; readonly hint?: string; readonly step: number }) {
  return (
    <div className="tile enter" style={enter(step)}>
      <span className="tile__label">{label}</span>
      <span className="tile__value">{children}</span>
      {hint && <span className="tile__hint muted">{hint}</span>}
    </div>
  )
}

function Count({ value }: { readonly value: number }) {
  return <>{Math.round(useCountUp(value, 900, HERO_COUNT_MS))}</>
}

/** Plain-language finding, key numbers, share-of-time bars and a donut for one recording. */
export function TimelineSummary({ segments, onShowDetail }: TimelineSummaryProps) {
  const [active, setActive] = useState<string | null>(null)

  const summary = summarizeRecording(segments)
  if (!summary) return <p className="empty">No behaviors detected in this recording.</p>

  const { totals } = summarizeTimeline(segments)
  const colors = buildColorMap(segments.map((s) => s.behavior_label))
  const leadInfo = behaviorInfo(summary.longest.label)
  const top = totals[0]
  const topInfo = behaviorInfo(top.label)
  const scaleMax = Math.max(0.1, Math.ceil(top.share * 10) / 10)
  const activate = (label: string | null) => () => setActive(label)

  return (
    <section className="summary" aria-label="Summary of this recording" style={{ ['--beh' as string]: colors[top.label] }}>
      <Hero
        label={summary.leadLabel}
        color={colors[summary.leadLabel]}
        eyebrow="Key finding"
        headline={summary.headline}
        context={summary.context}
        stat={
          <HeroStat
            label="Most common behavior"
            caption={`${topInfo.title} · ${formatDuration(summary.duration)} recording`}
            spoken={`${topInfo.title} took up ${percent(top.share)} of the recording`}
          >
            <AnimatedPercent value={top.share} delayMs={HERO_COUNT_MS} />
          </HeroStat>
        }
      >
        {summary.headline}
      </Hero>

      <div className="tiles">
        <Tile step={5} label="Recording length">{formatDuration(summary.duration)}</Tile>
        <Tile step={6} label="Behavior segments"><Count value={summary.segmentCount} /></Tile>
        <Tile step={7} label="Average confidence"><AnimatedPercent value={summary.meanConfidence} delayMs={HERO_COUNT_MS} /></Tile>
        <Tile
          step={8}
          label="Longest stretch"
          hint={`${capitalize(leadInfo.gerund)}, ${formatSeconds(summary.longest.start)}–${formatSeconds(summary.longest.end)}`}
        >
          {formatDuration(summary.longest.seconds)}
        </Tile>
      </div>

      <div className="chart-card enter" style={enter(9)}>
        <header className="chart-card__header">
          <div>
            <h3>Where the time went</h3>
            <p className="muted small">Share of the recording spent on each behavior</p>
          </div>
        </header>
        <div className="chart-grid chart-grid--single">
          <ul className="pairs">
            {totals.map((t, i) => {
              const info = behaviorInfo(t.label)
              const isStandout = i === 0
              const style = {
                ['--beh' as string]: colors[t.label],
                ['--p' as string]: (Math.min(t.share, scaleMax) / scaleMax) * 100,
                ['--d' as string]: `${barDelay(i)}ms`,
                ['--enter-delay' as string]: `${rowDelay(i)}ms`,
              } as CSSProperties
              return (
                <li
                  key={t.label}
                  className={`pair pair--single enter-at${isStandout ? ' pair--standout' : ''}${active === t.label ? ' is-active' : ''}${active && active !== t.label ? ' is-dim' : ''}`}
                  tabIndex={0}
                  aria-label={`${info.title}: ${percent(t.share)} of the recording, ${t.seconds.toFixed(1)} seconds${isStandout ? '. Most time' : ''}`}
                  style={style}
                  onPointerEnter={activate(t.label)}
                  onPointerLeave={activate(null)}
                  onFocus={activate(t.label)}
                  onBlur={activate(null)}
                >
                  <div className="pair__inner" aria-hidden="true">
                    <div className="pair__name">
                      <BehaviorChip label={t.label} color={colors[t.label]} />
                      <div>
                        <strong>
                          {info.title}
                          {isStandout && <span className="badge">Most time</span>}
                        </strong>
                        {info.description && <span className="muted small">{info.description}</span>}
                      </div>
                    </div>
                    <div className="pair__bars">
                      <div className="bar-lane bar-lane--treated">
                        <div className="bar-fill" />
                        <span className="bar-value"><AnimatedPercent value={t.share} delayMs={barDelay(i)} /></span>
                        <span className="tip" role="tooltip"><strong>{t.seconds.toFixed(1)} s</strong> of {formatSeconds(summary.duration)}</span>
                      </div>
                    </div>
                    <div className="pair__delta"><span className="delta delta--flat">{t.seconds.toFixed(1)} s</span></div>
                  </div>
                </li>
              )
            })}
          </ul>

          <aside className="donuts enter-at" style={{ ['--enter-delay' as string]: `${rowDelay(0)}ms` } as CSSProperties} aria-label="Share of the recording">
            <Donut
              name="This recording"
              slices={totals.map((t) => ({ label: t.label, value: t.share, color: colors[t.label] }))}
              defaultLabel={top.label}
              active={active}
              onActiveChange={setActive}
              delayMs={rowDelay(0) + 150}
            />
          </aside>
        </div>
      </div>

      <div className="chart-card enter" style={enter(10)}>
        <header className="chart-card__header">
          <div>
            <h3>Behavior over time</h3>
            <p className="muted small">Each block is one detected segment; fainter blocks are less certain</p>
          </div>
        </header>
        <TimelineRibbon segments={segments} animate />
      </div>

      {onShowDetail && (
        <button type="button" className="link-button enter" style={enter(11)} onClick={onShowDetail}>
          See every segment with timestamps and confidence in the Detail view →
        </button>
      )}
    </section>
  )
}
