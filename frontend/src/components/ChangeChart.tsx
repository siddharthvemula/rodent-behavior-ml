import type { CSSProperties } from 'react'
import type { CompareResult } from '../api/types'
import { buildColorMap, buildCompareRows } from '../lib/behaviors'
import { behaviorInfo } from '../lib/behaviorInfo'
import { axisTicks, changeAxisMax } from '../lib/changeScale'
import { orderLabels, percent } from '../lib/summary'

interface ChangeChartProps {
  readonly result: CompareResult
  /** Biggest change first (default) or the canonical behavior order. */
  readonly order?: 'change' | 'canonical'
  /** Behavior to flag as the biggest change. Omit to flag the largest mover; null for none. */
  readonly standout?: string | null
  /** Omit when the surrounding card already has its own A/B legend. */
  readonly showLegend?: boolean
  /** Linked highlight (Summary): the behavior hovered/focused anywhere in the card, or null. */
  readonly active?: string | null
  readonly onActiveChange?: (label: string | null) => void
}

const points = (difference: number) => Math.round(difference * 100)

/**
 * Dumbbell chart: one row per behavior, recording A and B as two dots on a
 * shared 0-N% axis, joined by a line. The gap *is* the change, so the biggest
 * mover is the longest line. Used in both the Summary and Detail views.
 */
export function ChangeChart({ result, order = 'change', standout: standoutProp, showLegend = true, active = null, onActiveChange }: ChangeChartProps) {
  const sorted = buildCompareRows(result)
  if (sorted.length === 0) return null
  const rows = order === 'canonical' ? orderLabels(sorted.map((r) => r.label)).map((l) => sorted.find((r) => r.label === l)!) : sorted
  const colors = buildColorMap(rows.map((r) => r.label))
  const max = changeAxisMax(rows.flatMap((r) => [r.control, r.treated]))
  const ticks = axisTicks(max)
  const pos = (v: number) => `${(Math.min(Math.max(v, 0), max) / max) * 100}%`
  const standout = standoutProp === undefined ? (points(rows[0].difference) !== 0 ? rows[0].label : null) : standoutProp

  return (
    <figure className="change" aria-label="Change from recording A to recording B">
      {showLegend && (
        <ul className="change__legend" aria-hidden="true">
          <li><span className="change__dot change__dot--control" /> Recording A</li>
          <li><span className="change__dot change__dot--treated" /> Recording B</li>
        </ul>
      )}
      <div className="change__rows" role="group" aria-label="Behaviors">
        {rows.map((r) => {
          const diff = points(r.difference)
          const info = behaviorInfo(r.label)
          const lo = Math.min(r.control, r.treated)
          const hi = Math.max(r.control, r.treated)
          const isStandout = r.label === standout
          return (
            <div
              role="group"
              key={r.label}
              className={`change__row${isStandout ? ' is-standout' : ''}${active === r.label ? ' is-active' : ''}${active && active !== r.label ? ' is-dim' : ''}`}
              onPointerEnter={onActiveChange && (() => onActiveChange(r.label))}
              onPointerLeave={onActiveChange && (() => onActiveChange(null))}
              onFocus={onActiveChange && (() => onActiveChange(r.label))}
              onBlur={onActiveChange && (() => onActiveChange(null))}
              tabIndex={0}
              aria-label={`${info.title}: recording A ${percent(r.control)}, recording B ${percent(r.treated)}, ${diff === 0 ? 'no difference' : `${Math.abs(diff)} percentage points ${diff > 0 ? 'higher' : 'lower'} in recording B`}${isStandout ? '. Biggest change' : ''}`}
              style={{ ['--beh' as string]: colors[r.label] } as CSSProperties}
            >
              <span className="change__name" aria-hidden="true">
                <span className="swatch" style={{ background: colors[r.label] }} />
                {info.title}
                {isStandout && <span className="badge">Biggest change</span>}
              </span>
              <span className="change__plot" aria-hidden="true">
                {ticks.map((t) => (
                  <span key={t} className="change__grid" style={{ left: pos(t) }} />
                ))}
                <span className="change__link" style={{ left: pos(lo), width: `${((hi - lo) / max) * 100}%` }} />
                <span className="change__dot change__dot--control change__dot--abs" style={{ left: pos(r.control) }} />
                <span className="change__dot change__dot--treated change__dot--abs" style={{ left: pos(r.treated) }} />
                <span className="change__tip" role="tooltip" style={{ left: pos((lo + hi) / 2) }}>
                  A {percent(r.control)} → B {percent(r.treated)}
                </span>
              </span>
              <span className={`change__delta${diff > 0 ? ' is-up' : diff < 0 ? ' is-down' : ''}`} aria-hidden="true">
                {diff === 0 ? 'same' : <>{diff > 0 ? '+' : '−'}{Math.abs(diff)}<span className="change__unit"> pts</span></>}
              </span>
            </div>
          )
        })}
      </div>
      <div className="change__axis muted small" aria-hidden="true">
        <span className="change__name" />
        <span className="change__axis-ticks">
          {ticks.map((t) => (
            <span key={t} style={{ left: pos(t) }}>{percent(t)}</span>
          ))}
        </span>
        <span className="change__delta" />
      </div>
    </figure>
  )
}
