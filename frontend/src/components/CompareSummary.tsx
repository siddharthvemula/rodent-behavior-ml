import { useState, type CSSProperties } from 'react'
import type { CompareResult } from '../api/types'
import { buildColorMap, buildCompareRows, type CompareRow } from '../lib/behaviors'
import { behaviorInfo, capitalize } from '../lib/behaviorInfo'
import { barDelay, HERO_COUNT_MS, rowDelay } from '../lib/motion'
import { orderLabels, percent, summarizeComparison } from '../lib/summary'
import { AnimatedPercent, AnimatedPoints } from './AnimatedPercent'
import { BehaviorChip } from './BehaviorIcon'
import { BehaviorKey } from './BehaviorKey'
import { Donut } from './Donut'
import { Hero, HeroStat } from './Hero'

interface CompareSummaryProps {
  readonly result: CompareResult
  readonly onShowDetail?: () => void
}

type Group = 'control' | 'treated'

const points = (difference: number) => Math.round(difference * 100)
const enter = (step: number) => ({ ['--s' as string]: step }) as CSSProperties

function describeRow(row: CompareRow, standout: boolean): string {
  const info = behaviorInfo(row.label)
  const diff = points(row.difference)
  const change = diff === 0 ? 'no difference' : `${Math.abs(diff)} percentage points ${diff > 0 ? 'higher' : 'lower'} in treated`
  return `${info.title}: control ${percent(row.control)}, treated ${percent(row.treated)}, ${change}${standout ? '. Biggest change' : ''}`
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

/** Plain-language finding plus animated control-vs-treated bars and donuts. */
export function CompareSummary({ result, onShowDetail }: CompareSummaryProps) {
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

  const largest = Math.max(...rows.flatMap((r) => [r.control, r.treated]))
  const scaleMax = Math.max(0.1, Math.ceil(largest * 10) / 10)
  const lead = summary.lead
  const standout = lead?.label ?? null
  const defaultLabel = standout ?? labels[0]
  const leadPoints = lead ? points(lead.difference) : 0

  const slices = (group: Group) => rows.map((r) => ({ label: r.label, value: r[group], color: colors[r.label] }))
  const activate = (label: string | null) => () => setActive(label)

  return (
    <section className="summary" aria-label="Summary of control vs treated" style={{ ['--beh' as string]: lead ? colors[lead.label] : 'var(--accent)' }}>
      <Hero
        label={lead?.label ?? 'other'}
        color={lead ? colors[lead.label] : 'var(--text-muted)'}
        eyebrow="Key finding · control → treated"
        headline={summary.headline}
        context={summary.context}
        extra={summary.alsoNoted}
        stat={
          lead && (
            <HeroStat
              label="Biggest change"
              unit="pts"
              caption={`${behaviorInfo(lead.label).title}, control → treated`}
              spoken={`${Math.abs(leadPoints)} percentage points ${leadPoints >= 0 ? 'higher' : 'lower'} in the treated recording`}
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
            <h3>How each recording spent its time</h3>
            <p className="muted small">Share of the recording spent on each behavior</p>
          </div>
          <ul className="key" aria-label="Legend">
            <li><span className="key__swatch key__swatch--control" aria-hidden="true" /> Control</li>
            <li><span className="key__swatch key__swatch--treated" aria-hidden="true" /> Treated</li>
          </ul>
        </header>

        <div className="chart-grid">
          <ul className="pairs">
            {rows.map((row, i) => {
              const info = behaviorInfo(row.label)
              const diff = points(row.difference)
              const isStandout = standout === row.label
              return (
                <li
                  key={row.label}
                  className={`pair enter-at${isStandout ? ' pair--standout' : ''}${active === row.label ? ' is-active' : ''}${active && active !== row.label ? ' is-dim' : ''}`}
                  tabIndex={0}
                  aria-label={describeRow(row, isStandout)}
                  style={{ ['--beh' as string]: colors[row.label], ['--enter-delay' as string]: `${rowDelay(i)}ms` } as CSSProperties}
                  onPointerEnter={activate(row.label)}
                  onPointerLeave={activate(null)}
                  onFocus={activate(row.label)}
                  onBlur={activate(null)}
                >
                  <div className="pair__inner" aria-hidden="true">
                    <div className="pair__name">
                      <BehaviorChip label={row.label} color={colors[row.label]} />
                      <div>
                        <strong>
                          {info.title}
                          {isStandout && <span className="badge">Biggest change</span>}
                        </strong>
                        {info.description && <span className="muted small">{info.description}</span>}
                      </div>
                    </div>
                    <div className="pair__bars">
                      <Bar group="control" value={row.control} scaleMax={scaleMax} delay={barDelay(i)} />
                      <Bar group="treated" value={row.treated} scaleMax={scaleMax} delay={barDelay(i) + 70} />
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

          <aside className="donuts enter-at" style={{ ['--enter-delay' as string]: `${rowDelay(0)}ms` } as CSSProperties} aria-label="Share of each recording">
            <div className="donuts__pair">
              <Donut name="Control" slices={slices('control')} defaultLabel={defaultLabel} active={active} onActiveChange={setActive} delayMs={rowDelay(0) + 150} />
              <Donut name="Treated" slices={slices('treated')} defaultLabel={defaultLabel} active={active} onActiveChange={setActive} delayMs={rowDelay(0) + 300} />
            </div>
            <BehaviorKey labels={labels} colors={colors} active={active} onActiveChange={setActive} />
          </aside>
        </div>

        <p className="footnote muted">
          pts = percentage points of the recording. Based on one control and one treated recording, classified
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
