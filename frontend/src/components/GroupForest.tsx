import { useState } from 'react'
import {
  BEHAVIOR_SPECS,
  CONTRASTS,
  GROUP_LABEL,
  KINDS,
  formatP,
  formatSigned,
  forestRows,
  pText,
  type GroupComparison,
  type KindKey,
} from '../lib/groupComparison'

const W = 460
const ROW_H = 24
const GAP = 22 // header line above each behavior's rows
const M = { top: 8, right: 74, bottom: 56, left: 132 }
const PLOT_W = W - M.left - M.right

interface Props {
  readonly data: GroupComparison
  readonly kind: KindKey
  readonly axis: { readonly lim: number; readonly ticks: readonly number[] }
}

/** One metric kind: effect size (Hedges' g) of each non-naive group vs naive, per behavior, on an axis shared by both kinds. */
export function GroupForest({ data, kind, axis }: Props) {
  const [active, setActive] = useState<number | null>(null)
  const spec = KINDS.find((k) => k.key === kind)!
  const rows = forestRows(data, kind)
  const per = CONTRASTS.length
  const y = (i: number) => M.top + ROW_H * (i + 0.5) + GAP * (Math.floor(i / per) + 1)
  const H = y(rows.length - 1) + ROW_H / 2 + M.bottom
  const x = (v: number) => M.left + ((v + axis.lim) / (2 * axis.lim)) * PLOT_W
  const swatch = (g: string) => `var(--grp-${['naive', 'stress', 'isolation', 'mated'].indexOf(g)})`
  const title = (behavior: string) => BEHAVIOR_SPECS.find((b) => b.key === behavior)!.title
  const describe = (i: number) => {
    const r = rows[i]
    return (
      `${title(r.behavior)}, ${GROUP_LABEL[r.group]} vs naive, ${spec.title.toLowerCase()}: effect size g ${formatSigned(r.g)} ` +
      `(95% CI ${formatSigned(r.ci[0], 1)} to ${formatSigned(r.ci[1], 1)}), difference ${formatSigned(r.diff, 2)} ${spec.short}, ` +
      `raw ${pText(r.pRaw)}, Holm-adjusted ${pText(r.pHolm)}`
    )
  }

  return (
    <figure className="pharm-chart grp-forest">
      <figcaption className="pharm-chart__title">{spec.title}</figcaption>
      <div className="pharm-chart__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Effect size of each group versus naive: ${spec.title}`}>
          {axis.ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'pharm-zero' : 'pharm-grid'} x1={x(t)} x2={x(t)} y1={M.top} y2={H - M.bottom} />
              <text className="pharm-axis" x={x(t)} y={H - M.bottom + 18} textAnchor="middle">
                {t < 0 ? `−${-t}` : t}
              </text>
            </g>
          ))}
          <text className="pharm-axis pharm-axis--muted" x={x(0) - 6} y={H - 12} textAnchor="end">
            {'← lower than naive'}
          </text>
          <text className="pharm-axis pharm-axis--muted" x={x(0) + 6} y={H - 12} textAnchor="start">
            {'higher than naive →'}
          </text>
          {rows.map((r, i) => {
            const colour = swatch(r.group)
            const show = () => setActive(i)
            return (
              <g key={`${r.behavior}-${r.group}`} data-testid="group-forest-row" data-significant={r.significant}>
                {i % per === 0 && (
                  <text className="pharm-axis pharm-axis--ink" x={6} y={y(i) - ROW_H / 2 - 6} fontWeight={600}>
                    {title(r.behavior)}
                  </text>
                )}
                <text className="pharm-axis" x={M.left - 10} y={y(i)} textAnchor="end" dominantBaseline="middle">
                  {GROUP_LABEL[r.group]}
                </text>
                <line className="pharm-ci" x1={x(r.ci[0])} x2={x(r.ci[1])} y1={y(i)} y2={y(i)} style={{ stroke: colour }} />
                <circle className="pharm-ring" cx={x(r.g)} cy={y(i)} r={6.5} />
                <circle
                  cx={x(r.g)}
                  cy={y(i)}
                  r={4.5}
                  data-marker={r.significant ? 'filled' : 'hollow'}
                  style={r.significant ? { fill: colour } : { fill: 'var(--surface)', stroke: colour, strokeWidth: 2 }}
                />
                <text className="pharm-axis" x={W - M.right + 8} y={y(i)} dominantBaseline="middle" fontWeight={r.significant ? 600 : 400}>
                  {pText(r.pHolm)}
                </text>
                <rect
                  className="pharm-hit"
                  x={0}
                  y={y(i) - ROW_H / 2}
                  width={W}
                  height={ROW_H}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={describe(i)}
                  onPointerEnter={show}
                  onPointerLeave={() => setActive(null)}
                  onFocus={show}
                  onBlur={() => setActive(null)}
                />
              </g>
            )
          })}
        </svg>
        {active !== null && (
          <div className="pharm-tip pharm-tip--rich" role="status" style={{ left: '50%', top: `${(y(active) / H) * 100}%` }}>
            <strong>
              g {formatSigned(rows[active].g)}
              {rows[active].significant ? '' : ' (not significant)'}
            </strong>{' '}
            <span className="pharm-tip__muted">
              {title(rows[active].behavior)}, {GROUP_LABEL[rows[active].group]} vs naive · 95% CI {formatSigned(rows[active].ci[0], 1)} to{' '}
              {formatSigned(rows[active].ci[1], 1)} · raw {pText(rows[active].pRaw)} · Holm {pText(rows[active].pHolm)}
            </span>
          </div>
        )}
      </div>
    </figure>
  )
}

/** Table twin of both forest plots: every planned comparison, without hovering. */
export function GroupEffectTable({ data }: { readonly data: GroupComparison }) {
  return (
    <div className="grp-table-scroll">
      <table className="pharm-table">
        <caption className="visually-hidden">Effect size, interval and p-values for every planned comparison against naive</caption>
        <thead>
          <tr>
            <th scope="col">Behavior and metric</th>
            <th scope="col">Group vs naive</th>
            <th scope="col">Effect size g (95% CI)</th>
            <th scope="col">Difference (95% CI)</th>
            <th scope="col">Raw p</th>
            <th scope="col">Holm p (across {data.metrics ? Object.keys(data.metrics).length * CONTRASTS.length : 0})</th>
          </tr>
        </thead>
        <tbody>
          {BEHAVIOR_SPECS.flatMap((b) =>
            KINDS.flatMap((k) =>
              data.metrics[`${b.key}_${k.key}`].comparisons.map((c) => (
                <tr key={`${b.key}-${k.key}-${c.group}`}>
                  <th scope="row">
                    {b.title}, {k.title.toLowerCase()}
                  </th>
                  <td>{GROUP_LABEL[c.group]}</td>
                  <td>
                    {formatSigned(c.hedges_g)} ({formatSigned(c.g_ci[0], 1)} to {formatSigned(c.g_ci[1], 1)})
                  </td>
                  <td>
                    {formatSigned(c.mean_diff, 2)} ({formatSigned(c.mean_diff_ci[0], 2)} to {formatSigned(c.mean_diff_ci[1], 2)}) {k.short}
                  </td>
                  <td>{formatP(c.p_perm)}</td>
                  <td>{formatP(c.p_holm ?? 1)}</td>
                </tr>
              )),
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
