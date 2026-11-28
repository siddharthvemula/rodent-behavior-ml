import { useState } from 'react'
import {
  DOSES,
  PRIMARY_SPECS,
  formatP,
  formatSigned,
  forestRows,
  primaryMetric,
  type DoseResponse,
  type ForestRow,
  type PrimarySpec,
} from '../lib/doseResponse'
import { doseLabel } from '../lib/openField'

const W = 420
const ROW_H = 40
const M = { top: 10, right: 84, bottom: 58, left: 80 }
const PLOT_W = W - M.left - M.right

interface Props {
  readonly spec: PrimarySpec
  readonly rows: readonly ForestRow[]
  readonly axis: { readonly lim: number; readonly ticks: readonly number[] }
  /** Summary view: same marks, but everyday words in place of p-values, effect-size numbers and intervals. */
  readonly plain?: boolean
}

const pText = (p: number) => (formatP(p).startsWith('<') ? `p ${formatP(p)}` : `p = ${formatP(p)}`)

function describe(spec: PrimarySpec, r: ForestRow): string {
  return (
    `${doseLabel(r.dose)} vs saline: effect size g ${formatSigned(r.g)} (95% CI ${formatSigned(r.ci[0], 1)} to ${formatSigned(r.ci[1], 1)}), ` +
    `difference ${formatSigned(r.diff, 1)} ${spec.unit}, Holm-adjusted ${pText(r.pHolm)}, ` +
    `${pText(r.pAll)} across all 12 primary comparisons`
  )
}

const verdict = (r: ForestRow) => (r.significant ? 'clear' : 'not clear')

function describePlain(spec: PrimarySpec, r: ForestRow): string {
  return (
    `${doseLabel(r.dose)} vs saline: ${formatSigned(r.diff, 1)} ${spec.unit} on average, ` +
    (r.significant ? 'a clear difference' : 'not a clear difference')
  )
}

/** One metric: effect size (Hedges' g) of each dose vs saline with its 95% interval, on an axis shared by every metric. */
export function EffectForest({ spec, rows, axis, plain = false }: Props) {
  const [active, setActive] = useState<number | null>(null)
  const H = M.top + rows.length * ROW_H + M.bottom
  const x = (v: number) => M.left + ((v + axis.lim) / (2 * axis.lim)) * PLOT_W
  const cy = (i: number) => M.top + ROW_H * (i + 0.5)
  const swatch = (dose: number) => `var(--dose-${DOSES.indexOf(dose as (typeof DOSES)[number])})`

  return (
    <figure className={`pharm-chart${plain ? ' pharm-chart--wide' : ''}`}>
      <figcaption className="pharm-chart__title">{spec.title}</figcaption>
      <div className="pharm-chart__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${plain ? 'Difference' : 'Effect size'} of each dose versus saline: ${spec.title}`}>
          {axis.ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'pharm-zero' : 'pharm-grid'} x1={x(t)} x2={x(t)} y1={M.top} y2={H - M.bottom} />
              <text className="pharm-axis" x={x(t)} y={H - M.bottom + 18} textAnchor="middle">
                {plain ? (t === 0 ? 'same' : '') : t < 0 ? `−${-t}` : t}
              </text>
            </g>
          ))}
          <text className="pharm-axis pharm-axis--muted" x={x(0) - 6} y={H - 10} textAnchor="end">
            {'← lower than saline'}
          </text>
          <text className="pharm-axis pharm-axis--muted" x={x(0) + 6} y={H - 10} textAnchor="start">
            {'higher than saline →'}
          </text>
          {rows.map((r, i) => {
            const label = plain ? describePlain(spec, r) : describe(spec, r)
            const colour = swatch(r.dose)
            const show = () => setActive(i)
            return (
              <g key={r.dose} data-testid="forest-row" data-significant={r.significant}>
                <text className="pharm-axis" x={M.left - 10} y={cy(i)} textAnchor="end" dominantBaseline="middle">
                  {doseLabel(r.dose)}
                </text>
                <line className="pharm-ci" x1={x(r.ci[0])} x2={x(r.ci[1])} y1={cy(i)} y2={cy(i)} style={{ stroke: colour }} />
                <circle className="pharm-ring" cx={x(r.g)} cy={cy(i)} r={7} />
                <circle
                  cx={x(r.g)}
                  cy={cy(i)}
                  r={5}
                  data-marker={r.significant ? 'filled' : 'hollow'}
                  style={r.significant ? { fill: colour } : { fill: 'var(--surface)', stroke: colour, strokeWidth: 2 }}
                />
                <text className="pharm-axis" x={W - M.right + 10} y={cy(i)} dominantBaseline="middle" fontWeight={r.significant ? 600 : 400}>
                  {plain ? verdict(r) : pText(r.pHolm)}
                </text>
                <rect
                  className="pharm-hit"
                  x={0}
                  y={cy(i) - ROW_H / 2}
                  width={W}
                  height={ROW_H}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={label}
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
          <div className="pharm-tip pharm-tip--rich" role="status" style={{
              left: '50%',
              top: `${(cy(active) / H) * 100}%`,
              transform: active === 0 ? 'translate(-50%, 16px)' : undefined,
            }}
          >
            {plain ? (
              <span>{describePlain(spec, rows[active])}</span>
            ) : (
              <>
                <strong>
                  g {formatSigned(rows[active].g)}
                  {rows[active].significant ? '' : ' (not significant)'}
                </strong>{' '}
                <span className="pharm-tip__muted">
                  {doseLabel(rows[active].dose)} vs saline · 95% CI {formatSigned(rows[active].ci[0], 1)} to {formatSigned(rows[active].ci[1], 1)} ·{' '}
                  {formatSigned(rows[active].diff, 1)} {spec.unit} · Holm {pText(rows[active].pHolm)}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </figure>
  )
}

/** Table twin of every forest plot: each value the charts show, without hovering. */
export function EffectTable({ data }: { readonly data: DoseResponse }) {
  return (
    <table className="pharm-table">
      <caption className="visually-hidden">Effect size, interval and p-values for every primary comparison against saline</caption>
      <thead>
        <tr>
          <th scope="col">Metric</th>
          <th scope="col">Dose</th>
          <th scope="col">Effect size g (95% CI)</th>
          <th scope="col">Difference</th>
          <th scope="col">Raw p</th>
          <th scope="col">Holm p (within 6)</th>
          <th scope="col">Holm p (across 12)</th>
        </tr>
      </thead>
      <tbody>
        {PRIMARY_SPECS.flatMap((spec) =>
          forestRows(primaryMetric(data, spec.key)).map((r) => (
            <tr key={`${spec.key}-${r.dose}`}>
              <th scope="row">{spec.title}</th>
              <td>{doseLabel(r.dose)}</td>
              <td>
                {formatSigned(r.g)} ({formatSigned(r.ci[0], 1)} to {formatSigned(r.ci[1], 1)})
              </td>
              <td>
                {formatSigned(r.diff, 1)} {spec.unit}
              </td>
              <td>{formatP(r.pRaw)}</td>
              <td>{formatP(r.pHolm)}</td>
              <td>{formatP(r.pAll)}</td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  )
}
