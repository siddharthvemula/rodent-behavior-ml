import { useState } from 'react'
import {
  jitter,
  mean,
  median,
  niceMax,
  type DoseGroup,
  type MetricSpec,
} from '../lib/openField'

const W = 420
const H = 300
const M = { top: 12, right: 12, bottom: 50, left: 68 }
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom

interface Props {
  readonly metric: MetricSpec
  readonly groups: readonly DoseGroup[]
}

interface Hover {
  readonly x: number
  readonly y: number
  readonly text: string
}

/** One metric: every mouse as a dot per dose group, with the group mean and median marked. */
export function DoseStripChart({ metric, groups }: Props) {
  const [hover, setHover] = useState<Hover | null>(null)
  const values = groups.flatMap((g) => g.mice.map((m) => m[metric.key]))
  const max = metric.fixedMax ?? niceMax(Math.max(...values) * 1.05)
  // Max is 1/2/5 x 10^n (or 100), so these counts give round tick steps.
  const mantissa = max / 10 ** Math.floor(Math.log10(max))
  const TICKS = mantissa === 2 || metric.fixedMax ? 4 : 5
  const y = (v: number) => M.top + PLOT_H - (v / max) * PLOT_H
  const colW = PLOT_W / groups.length
  const cx = (i: number) => M.left + colW * (i + 0.5)

  return (
    <figure className="pharm-chart">
      <figcaption className="pharm-chart__title">
        {metric.title} <span className="muted">({metric.unit})</span>
      </figcaption>
      <div className="pharm-chart__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${metric.title} per mouse by dose group`}>
          {Array.from({ length: TICKS + 1 }, (_, t) => {
            const v = (max / TICKS) * t
            return (
              <g key={t}>
                <line className="pharm-grid" x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} />
                <text className="pharm-axis" x={M.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle">
                  {metric.key === 'mean_speed_px_per_frame' ? v.toFixed(1) : Math.round(v).toLocaleString('en-US')}
                </text>
              </g>
            )
          })}
          {groups.map((g, i) => {
            const vals = g.mice.map((m) => m[metric.key])
            const half = colW * 0.34
            return (
              <g key={g.dose}>
                <text className="pharm-axis" x={cx(i)} y={H - 26} textAnchor="middle">
                  {g.label}
                </text>
                <text className="pharm-axis pharm-axis--muted" x={cx(i)} y={H - 8} textAnchor="middle">
                  n = {g.mice.length}
                </text>
                <line className="pharm-median" x1={cx(i) - half} x2={cx(i) + half} y1={y(median(vals))} y2={y(median(vals))} />
                <line className="pharm-mean" x1={cx(i) - half} x2={cx(i) + half} y1={y(mean(vals))} y2={y(mean(vals))} />
                {g.mice.map((m, j) => {
                  const px = cx(i) + jitter(j, g.mice.length) * colW * 0.22
                  const py = y(m[metric.key])
                  const text = `${m.id} · ${g.label} · ${metric.format(m[metric.key])}`
                  const show = () => setHover({ x: px / W, y: py / H, text })
                  return (
                    <g key={m.id} data-testid="mouse-dot" data-group={g.dose}>
                      <circle
                        cx={px}
                        cy={py}
                        r={5}
                        className="pharm-dot"
                        style={{ fill: `var(--dose-${i})` }}
                        aria-label={text}
                      />
                      <circle
                        cx={px}
                        cy={py}
                        r={11}
                        fill="transparent"
                        tabIndex={0}
                        aria-label={text}
                        onPointerEnter={show}
                        onPointerLeave={() => setHover(null)}
                        onFocus={show}
                        onBlur={() => setHover(null)}
                      />
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
        {hover && (
          <div
            className="pharm-tip"
            role="status"
            style={{ left: `${hover.x * 100}%`, top: `${hover.y * 100}%` }}
          >
            {hover.text}
          </div>
        )}
      </div>
    </figure>
  )
}
