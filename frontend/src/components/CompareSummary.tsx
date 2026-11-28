import type { CSSProperties } from 'react'
import type { CompareIntervals, CompareResult } from '../api/types'
import { buildColorMap, buildCompareRows } from '../lib/behaviors'
import { behaviorInfo, capitalize } from '../lib/behaviorInfo'
import { differenceVerdict } from '../lib/intervals'
import { HERO_COUNT_MS } from '../lib/motion'
import { orderLabels, summarizeComparison } from '../lib/summary'
import { AnimatedPercent, AnimatedPoints } from './AnimatedPercent'
import { ChangeChart } from './ChangeChart'
import { Hero, HeroStat } from './Hero'
import { lower, tail, useRecordingNames } from '../lib/recordingNames'

interface CompareSummaryProps {
  readonly result: CompareResult
  readonly intervals?: CompareIntervals | null
  readonly onShowDetail?: () => void
}

const points = (difference: number) => Math.round(difference * 100)
const enter = (step: number) => ({ ['--s' as string]: step }) as CSSProperties

/** One plain-language finding and one chart. Ranges, donuts and exact values are in the Detail view. */
export function CompareSummary({ result, intervals = null, onShowDetail }: CompareSummaryProps) {
  const names = useRecordingNames()
  const summary = summarizeComparison(result)
  const rowsByLabel = new Map(buildCompareRows(result).map((r) => [r.label, r]))
  const labels = orderLabels([...rowsByLabel.keys()])
  const colors = buildColorMap(labels)

  if (summary.kind === 'empty') {
    return <p className="empty">No behaviors detected in either recording.</p>
  }

  const lead = summary.lead
  const standout = lead?.label ?? null
  const leadPoints = lead ? points(lead.difference) : 0
  // The ranges themselves are in Detail; here, only say in words when the headline change could be ordinary variation.
  const unsure = lead ? differenceVerdict(intervals?.difference[lead.label]) === 'within' : false

  return (
    <section className="summary" data-demo="compare-result" aria-label="Summary of two-recording comparison" style={{ ['--beh' as string]: lead ? colors[lead.label] : 'var(--accent)' }}>
      <Hero
        label={lead?.label ?? 'other'}
        color={lead ? colors[lead.label] : 'var(--text-muted)'}
        eyebrow={`Key finding · ${lower(names.a)} → ${tail(names.b)}`}
        headline={summary.headline}
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

        <ChangeChart result={result} order="canonical" standout={standout} showLegend={false} />

        <p className="footnote muted">
          {unsure && <strong>A change this size could be ordinary variation within these two recordings. </strong>}
          pts = percentage points of the recording. Behaviors are labelled automatically from pose tracking, and this
          describes these two recordings only.
        </p>
      </div>

      {onShowDetail && (
        <button type="button" className="link-button enter" style={enter(10)} onClick={onShowDetail}>
          See exact values, ranges and more charts in the Detail view →
        </button>
      )}
    </section>
  )
}
