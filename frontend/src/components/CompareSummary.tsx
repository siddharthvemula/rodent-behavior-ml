import { useState, type CSSProperties } from 'react'
import type { CompareIntervals, CompareResult } from '../api/types'
import { buildColorMap, buildCompareRows } from '../lib/behaviors'
import { behaviorInfo, capitalize } from '../lib/behaviorInfo'
import { HERO_COUNT_MS, rowDelay } from '../lib/motion'
import { orderLabels, summarizeComparison } from '../lib/summary'
import { AnimatedPercent, AnimatedPoints } from './AnimatedPercent'
import { BehaviorKey } from './BehaviorKey'
import { ChangeChart } from './ChangeChart'
import { Donut } from './Donut'
import { Hero, HeroStat } from './Hero'
import { lower, tail, useRecordingNames } from '../lib/recordingNames'

interface CompareSummaryProps {
  readonly result: CompareResult
  readonly intervals?: CompareIntervals | null
  readonly onShowDetail?: () => void
}

type Group = 'control' | 'treated'

const points = (difference: number) => Math.round(difference * 100)
const enter = (step: number) => ({ ['--s' as string]: step }) as CSSProperties

/** Plain-language finding plus animated side-by-side bars and donuts. */
export function CompareSummary({ result, intervals = null, onShowDetail }: CompareSummaryProps) {
  const names = useRecordingNames()
  // The behavior highlighted across bars and donuts (hover / focus), or null.
  const [active, setActive] = useState<string | null>(null)

  const summary = summarizeComparison(result)
  const rowsByLabel = new Map(buildCompareRows(result).map((r) => [r.label, r]))
  const labels = orderLabels([...rowsByLabel.keys()])
  const rows = labels.map((l) => rowsByLabel.get(l)!)
  const colors = buildColorMap(labels)

  if (summary.kind === 'empty') {
    return <p className="empty">No behaviors detected in either recording.</p>
  }

  const lead = summary.lead
  const standout = lead?.label ?? null
  const defaultLabel = standout ?? labels[0]
  const leadPoints = lead ? points(lead.difference) : 0

  const slices = (group: Group) => rows.map((r) => ({ label: r.label, value: r[group], color: colors[r.label] }))

  return (
    <section className="summary" data-demo="compare-result" aria-label="Summary of two-recording comparison" style={{ ['--beh' as string]: lead ? colors[lead.label] : 'var(--accent)' }}>
      <Hero
        label={lead?.label ?? 'other'}
        color={lead ? colors[lead.label] : 'var(--text-muted)'}
        eyebrow={`Key finding · ${lower(names.a)} → ${tail(names.b)}`}
        headline={summary.headline}
        context={summary.context}
        extra={summary.alsoNoted}
        stat={
          lead && (
            <HeroStat
              label="Biggest change"
              unit="pts"
              caption={`${behaviorInfo(lead.label).title}, ${lower(names.a)} → ${tail(names.b)}`}
              spoken={`${Math.abs(leadPoints)} percentage points ${leadPoints >= 0 ? 'higher' : 'lower'} in ${lower(names.b)}`}
            >
              <AnimatedPoints difference={lead.difference} delayMs={HERO_COUNT_MS} />
            </HeroStat>
          )
        }
      >
        {lead ? (
          <>
            {capitalize(behaviorInfo(lead.label).gerund)} {lead.verb} from{' '}
            <strong className="hero__num"><AnimatedPercent value={lead.control} delayMs={HERO_COUNT_MS} /></strong> to{' '}
            <strong className="hero__num"><AnimatedPercent value={lead.treated} delayMs={HERO_COUNT_MS} /></strong> of the time
          </>
        ) : (
          summary.headline
        )}
      </Hero>

      <div className="chart-card enter" style={enter(8)}>
        <header className="chart-card__header">
          <div>
            <h3>What changed from A to B</h3>
            <p className="muted small">Each dot is the share of a recording spent on that behavior; the longer the line, the bigger the difference</p>
          </div>
          <ul className="key" aria-label="Legend">
            <li><span className="key__swatch key__swatch--control" aria-hidden="true" /> {names.a}</li>
            <li><span className="key__swatch key__swatch--treated" aria-hidden="true" /> {names.b}</li>
          </ul>
        </header>

        <div className="chart-grid">
          <ChangeChart result={result} intervals={intervals} order="canonical" standout={standout} showLegend={false} active={active} onActiveChange={setActive} />

          <aside className="donuts enter-at" style={{ ['--enter-delay' as string]: `${rowDelay(0)}ms` } as CSSProperties} aria-label="Share of each recording">
            <div className="donuts__pair">
              <Donut name={names.a} slices={slices('control')} defaultLabel={defaultLabel} active={active} onActiveChange={setActive} delayMs={rowDelay(0) + 150} />
              <Donut name={names.b} slices={slices('treated')} defaultLabel={defaultLabel} active={active} onActiveChange={setActive} delayMs={rowDelay(0) + 300} />
            </div>
            <BehaviorKey labels={labels} colors={colors} active={active} onActiveChange={setActive} />
          </aside>
        </div>

        <p className="footnote muted">
          pts = percentage points of the recording. Based on two recordings, classified
          automatically from pose tracking; it describes these clips and is not a statistical test.
        </p>
      </div>

      {onShowDetail && (
        <button type="button" className="link-button enter" style={enter(10)} onClick={onShowDetail}>
          See exact values in the Detail view →
        </button>
      )}
    </section>
  )
}
