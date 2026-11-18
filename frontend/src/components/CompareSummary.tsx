import type { CSSProperties } from 'react'
import type { CompareResult } from '../api/types'
import { buildColorMap, buildCompareRows, type CompareRow } from '../lib/behaviors'
import { behaviorInfo, capitalize } from '../lib/behaviorInfo'
import { orderLabels, percent, summarizeComparison } from '../lib/summary'
import { AnimatedPercent } from './AnimatedPercent'
import { BehaviorChip } from './BehaviorIcon'
import { Hero } from './Hero'

interface CompareSummaryProps {
  readonly result: CompareResult
  readonly onShowDetail?: () => void
}

type Group = 'control' | 'treated'

const STAGGER_MS = 110
const BAR_START_MS = 250

const points = (difference: number) => Math.round(difference * 100)

function describeRow(row: CompareRow): string {
  const info = behaviorInfo(row.label)
  const diff = points(row.difference)
  const change = diff === 0 ? 'no difference' : `${Math.abs(diff)} percentage points ${diff > 0 ? 'higher' : 'lower'} in treated`
  return `${info.title}: control ${percent(row.control)}, treated ${percent(row.treated)}, ${change}`
}

function Arrow({ up }: { readonly up: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {up ? <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></> : <><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>}
    </svg>
  )
}

function Bar({ group, value, scaleMax, delay }: { readonly group: Group; readonly value: number; readonly scaleMax: number; readonly delay: number }) {
  const width = (Math.min(value, scaleMax) / scaleMax) * 100
  const style = { ['--p' as string]: width, ['--d' as string]: `${delay}ms` } as CSSProperties
  return (
    <div className={`bar-lane bar-lane--${group}`} style={style}>
      <div className="bar-fill" />
      <span className="bar-value">
        <AnimatedPercent value={value} delayMs={delay} />
      </span>
      <span className="tip" role="tooltip">
        <strong>{percent(value)}</strong> of the {group} recording
      </span>
    </div>
  )
}

/** Plain-language finding plus an animated control-vs-treated bar chart. */
export function CompareSummary({ result, onShowDetail }: CompareSummaryProps) {
  const summary = summarizeComparison(result)
  const rowsByLabel = new Map(buildCompareRows(result).map((r) => [r.label, r]))
  const labels = orderLabels([...rowsByLabel.keys()])
  const rows = labels.map((l) => rowsByLabel.get(l)!)
  const colors = buildColorMap(labels)

  if (summary.kind === 'empty') {
    return <p className="empty">No behaviors detected in either recording.</p>
  }

  const largest = Math.max(...rows.flatMap((r) => [r.control, r.treated]))
  const scaleMax = Math.max(0.1, Math.ceil(largest * 10) / 10)
  const lead = summary.lead

  return (
    <section className="summary" aria-label="Summary of control vs treated">
      <Hero
        label={lead?.label ?? 'other'}
        color={lead ? colors[lead.label] : 'var(--text-muted)'}
        eyebrow="Key finding · control → treated"
        headline={summary.headline}
        context={summary.context}
        extra={summary.alsoNoted}
      >
        {lead ? (
          <>
            {capitalize(behaviorInfo(lead.label).gerund)} {lead.verb} from{' '}
            <strong className="hero__num"><AnimatedPercent value={lead.control} delayMs={BAR_START_MS} /></strong> to{' '}
            <strong className="hero__num"><AnimatedPercent value={lead.treated} delayMs={BAR_START_MS} /></strong> of the time
          </>
        ) : (
          summary.headline
        )}
      </Hero>

      <div className="chart-card">
        <header className="chart-card__header">
          <div>
            <h3>How each recording spent its time</h3>
            <p className="muted small">Share of the recording spent on each behavior</p>
          </div>
          <ul className="key" aria-label="Legend">
            <li><span className="key__swatch key__swatch--control" aria-hidden="true" /> Control</li>
            <li><span className="key__swatch key__swatch--treated" aria-hidden="true" /> Treated</li>
          </ul>
        </header>

        <ul className="pairs">
          {rows.map((row, i) => {
            const delay = BAR_START_MS + i * STAGGER_MS
            const diff = points(row.difference)
            const info = behaviorInfo(row.label)
            return (
              <li key={row.label} className="pair" tabIndex={0} aria-label={describeRow(row)} style={{ ['--beh' as string]: colors[row.label], ['--i' as string]: i } as CSSProperties}>
                <div className="pair__inner" aria-hidden="true">
                  <div className="pair__name">
                    <BehaviorChip label={row.label} color={colors[row.label]} />
                    <div>
                      <strong>{info.title}</strong>
                      {info.description && <span className="muted small">{info.description}</span>}
                    </div>
                  </div>
                  <div className="pair__bars">
                    <Bar group="control" value={row.control} scaleMax={scaleMax} delay={delay} />
                    <Bar group="treated" value={row.treated} scaleMax={scaleMax} delay={delay + 70} />
                  </div>
                  <div className="pair__delta">
                    {diff === 0 ? (
                      <span className="delta delta--flat">about the same</span>
                    ) : (
                      <span className={`delta ${diff > 0 ? 'delta--up' : 'delta--down'}`}>
                        <Arrow up={diff > 0} />
                        {diff > 0 ? '+' : '−'}{Math.abs(diff)} pts
                      </span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        <p className="footnote muted">
          pts = percentage points of the recording. Based on one control and one treated recording, classified
          automatically from pose tracking; it describes these clips and is not a statistical test.
        </p>
      </div>

      {onShowDetail && (
        <button type="button" className="link-button" onClick={onShowDetail}>
          See exact values in the Detail view →
        </button>
      )}
    </section>
  )
}
