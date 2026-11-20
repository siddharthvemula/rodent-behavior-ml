import { useState } from 'react'
import { formatSigned, type DoseResponse } from '../lib/doseResponse'
import { doseLabel, niceMax } from '../lib/openField'

const W = 420
const H = 300
const M = { top: 14, right: 78, bottom: 58, left: 44 }
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom
const LABEL_GAP = 14

interface Props {
  readonly data: DoseResponse
}

const minutes = (b: number, per: number) => `${Math.round(b * per)}–${Math.round((b + 1) * per)}`

/** Distance per equal-length bin of the session, one line per dose. Means only; the tooltip and table carry the intervals. */
export function TimeCourseChart({ data }: Props) {
  const [active, setActive] = useState<number | null>(null)
  const tc = data.phase_b.time_course
  const per = data.phase_b.time_axis.minutes_per_bin_if_assumed
  const fps = data.phase_b.time_axis.fps_assumed
  const n = tc.n_bins
  const max = niceMax(Math.max(...tc.doses.flatMap((s) => s.bins.map((b) => b.mean))) * 1.05)
  const mantissa = max / 10 ** Math.floor(Math.log10(max))
  const TICKS = mantissa === 2 ? 4 : 5
  const x = (b: number) => M.left + (PLOT_W / n) * (b + 0.5)
  const y = (v: number) => M.top + PLOT_H - (v / max) * PLOT_H
  const colour = (i: number) => `var(--dose-${i})`

  // Direct end-labels, dropped (never nudged away from their line) where two would collide; the legend and tooltip still name every series.
  const ends = tc.doses.map((s, i) => ({ i, y: y(s.bins[n - 1].mean), dose: s.dose_mg_kg }))
  const labelled = new Set<number>()
  let lastY = -Infinity
  for (const e of [...ends].sort((a, b) => a.y - b.y)) {
    if (e.y - lastY >= LABEL_GAP) {
      labelled.add(e.i)
      lastY = e.y
    }
  }

  return (
    <figure className="pharm-chart pharm-chart--wide">
      <figcaption className="pharm-chart__title">
        Distance traveled per time bin <span className="muted">(arena widths; saline vs each dose)</span>
      </figcaption>
      <div className="pharm-chart__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Distance traveled in each time bin, one line per dose group">
          {Array.from({ length: TICKS + 1 }, (_, t) => {
            const v = (max / TICKS) * t
            return (
              <g key={t}>
                <line className="pharm-grid" x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} />
                <text className="pharm-axis" x={M.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle">
                  {Math.round(v)}
                </text>
              </g>
            )
          })}
          {Array.from({ length: n }, (_, b) => (
            <text key={b} className="pharm-axis" x={x(b)} y={H - M.bottom + 20} textAnchor="middle">
              {minutes(b, per)}
            </text>
          ))}
          <text className="pharm-axis pharm-axis--muted" x={M.left + PLOT_W / 2} y={H - 10} textAnchor="middle">
            Session time in minutes (assumes {fps} fps, inferred)
          </text>
          {active !== null && <line className="pharm-cross" x1={x(active)} x2={x(active)} y1={M.top} y2={H - M.bottom} />}
          {tc.doses.map((s, i) => (
            <g key={s.dose_mg_kg} data-testid="time-series" data-dose={s.dose_mg_kg}>
              <polyline
                className="pharm-line"
                points={s.bins.map((b, j) => `${x(j)},${y(b.mean)}`).join(' ')}
                style={{ stroke: colour(i) }}
              />
              {s.bins.map((b, j) => (
                <g key={j}>
                  <circle className="pharm-ring" cx={x(j)} cy={y(b.mean)} r={active === j ? 7 : 6} />
                  <circle cx={x(j)} cy={y(b.mean)} r={active === j ? 5 : 4} style={{ fill: colour(i) }} />
                </g>
              ))}
              {labelled.has(i) && (
                <text className="pharm-axis pharm-axis--ink" x={x(n - 1) + 12} y={y(s.bins[n - 1].mean)} dominantBaseline="middle">
                  {doseLabel(s.dose_mg_kg)}
                </text>
              )}
            </g>
          ))}
          {Array.from({ length: n }, (_, b) => (
            <rect
              key={b}
              className="pharm-hit"
              data-testid="time-bin"
              x={x(b) - PLOT_W / n / 2}
              y={M.top}
              width={PLOT_W / n}
              height={PLOT_H}
              fill="transparent"
              tabIndex={0}
              aria-label={`${minutes(b, per)} minutes: ${tc.doses.map((s) => `${doseLabel(s.dose_mg_kg)} ${s.bins[b].mean.toFixed(1)}`).join(', ')} arena widths`}
              onPointerEnter={() => setActive(b)}
              onPointerMove={() => setActive(b)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(b)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>
        {active !== null && (
          <div
            className="pharm-tip pharm-tip--rich pharm-tip--list"
            role="status"
            style={{ left: `${(x(active) / W) * 100}%`, top: '6%', transform: active >= n - 2 ? 'translate(calc(-100% - 14px), 0)' : 'translate(14px, 0)' }}
          >
            <div className="pharm-tip__head">{minutes(active, per)} min (assumes {fps} fps)</div>
            {tc.doses.map((s, i) => {
              const b = s.bins[active]
              return (
                <div key={s.dose_mg_kg} className="pharm-tip__row">
                  <span className="pharm-key" style={{ background: colour(i) }} aria-hidden="true" />
                  <strong>{b.mean.toFixed(1)}</strong>
                  <span className="pharm-tip__muted">
                    {doseLabel(s.dose_mg_kg)} · 95% CI {b.ci[0].toFixed(1)}–{b.ci[1].toFixed(1)}
                    {b.hedges_g_vs_saline !== undefined ? ` · g ${formatSigned(b.hedges_g_vs_saline, 1)}` : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </figure>
  )
}

/** Table twin of the time course. */
export function TimeCourseTable({ data }: Props) {
  const tc = data.phase_b.time_course
  const per = data.phase_b.time_axis.minutes_per_bin_if_assumed
  const fps = data.phase_b.time_axis.fps_assumed
  return (
    <table className="pharm-table">
      <caption className="visually-hidden">Mean distance per time bin for each dose group, with 95% intervals</caption>
      <thead>
        <tr>
          <th scope="col">Minutes (assumes {fps} fps)</th>
          {tc.doses.map((s) => (
            <th key={s.dose_mg_kg} scope="col">
              {doseLabel(s.dose_mg_kg)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: tc.n_bins }, (_, b) => (
          <tr key={b}>
            <th scope="row">{minutes(b, per)}</th>
            {tc.doses.map((s) => (
              <td key={s.dose_mg_kg}>
                {s.bins[b].mean.toFixed(1)} ({s.bins[b].ci[0].toFixed(1)}–{s.bins[b].ci[1].toFixed(1)})
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
