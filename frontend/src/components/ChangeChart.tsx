import type { CSSProperties } from 'react'
import type { CompareIntervals, CompareResult } from '../api/types'
import { buildColorMap, buildCompareRows } from '../lib/behaviors'
import { behaviorInfo } from '../lib/behaviorInfo'
import { axisTicks, changeAxisMax } from '../lib/changeScale'
import { differenceVerdict, formatDifferenceRange, formatRange, verdictText } from '../lib/intervals'
import { orderLabels, percent } from '../lib/summary'

interface ChangeChartProps {
  readonly result: CompareResult
  /** 95% bootstrap ranges from the backend; when present, whiskers and a noise verdict are drawn. */
  readonly intervals?: CompareIntervals | null
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
export function ChangeChart({ result, intervals = null, order = 'change', standout: standoutProp, showLegend = true, active = null, onActiveChange }: ChangeChartProps) {
  const sorted = buildCompareRows(result)
  if (sorted.length === 0) return null
  const rows = order === 'canonical' ? orderLabels(sorted.map((r) => r.label)).map((l) => sorted.find((r) => r.label === l)!) : sorted
  const colors = buildColorMap(rows.map((r) => r.label))
  const max = changeAxisMax(rows.flatMap((r) => [r.control, r.treated, ...(intervals ? [...(intervals.control[r.label] ?? []), ...(intervals.treated[r.label] ?? [])] : [])]))
  const ticks = axisTicks(max)
  const pos = (v: number) => `${(Math.min(Math.max(v, 0), max) / max) * 100}%`
  const standout = standoutProp === undefined ? (points(rows[0].difference) !== 0 ? rows[0].label : null) : standoutProp

  return (
    <figure className={`change${intervals ? ' change--ranges' : ''}`} aria-label="Change from recording A to recording B">
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
          const aRange = intervals?.control[r.label]
          const bRange = intervals?.treated[r.label]
          const dRange = intervals?.difference[r.label]
          const verdict = differenceVerdict(dRange)
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
              aria-label={`${info.title}: recording A ${percent(r.control)}, recording B ${percent(r.treated)}, ${diff === 0 ? 'no difference' : `${Math.abs(diff)} percentage points ${diff > 0 ? 'higher' : 'lower'} in recording B`}${isStandout ? '. Biggest change' : ''}${dRange && verdict ? `. 95% range for the difference ${formatDifferenceRange(dRange)}, ${verdictText(verdict)}` : ''}`}
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
                {aRange && <span className="change__whisker change__whisker--control" style={{ left: pos(aRange[0]), width: `${((Math.min(aRange[1], max) - Math.min(aRange[0], max)) / max) * 100}%` }} />}
                {bRange && <span className="change__whisker change__whisker--treated" style={{ left: pos(bRange[0]), width: `${((Math.min(bRange[1], max) - Math.min(bRange[0], max)) / max) * 100}%` }} />}
                <span className="change__link" style={{ left: pos(lo), width: `${((hi - lo) / max) * 100}%` }} />
                <span className="change__dot change__dot--control change__dot--abs" style={{ left: pos(r.control) }} />
                <span className="change__dot change__dot--treated change__dot--abs" style={{ left: pos(r.treated) }} />
                <span className="change__tip" role="tooltip" style={{ left: pos((lo + hi) / 2) }}>
                  A {percent(r.control)}{aRange && ` (${formatRange(aRange)})`} → B {percent(r.treated)}{bRange && ` (${formatRange(bRange)})`}
                </span>
              </span>
              <span className="change__delta" aria-hidden="true">
                {diff === 0 ? 'same' : <>{diff > 0 ? '+' : '−'}{Math.abs(diff)}<span className="change__unit"> pts</span></>}
                {verdict && <span className={`change__verdict is-${verdict}`}>{verdictText(verdict)}</span>}
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
      {intervals && (
        <p className="change__note muted small">
          Thin bars show the {Math.round(intervals.level * 100)}% range for each recording's own percentage, from resampling its ~10 s stretches. “Beyond noise” means the range for the A→B difference excludes zero. It does not show that two animals or groups differ.
        </p>
      )}
    </figure>
  )
}
