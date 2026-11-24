import { useState } from 'react'
import { GROUPS, GROUP_LABEL, type MetricStats } from '../lib/groupComparison'
import { jitter, mean, median, niceMax } from '../lib/openField'

const W = 420
const H = 280
const M = { top: 12, right: 12, bottom: 50, left: 52 }
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom

interface Props {
  readonly metric: MetricStats
  readonly title: string
  readonly unit: string
}

interface Hover {
  readonly x: number
  readonly y: number
  readonly text: string
}

const fmt = (v: number, max: number) => (max >= 10 ? Math.round(v).toLocaleString('en-US') : v.toFixed(max >= 1 ? 1 : 2))

/** One metric: every recording as a dot per group, with the group mean and median marked. */
export function GroupStripChart({ metric, title, unit }: Props) {
  const [hover, setHover] = useState<Hover | null>(null)
  const all = GROUPS.flatMap((g) => metric.groups[g].values)
  const max = niceMax(Math.max(...all, 0.01) * 1.05)
  // max is 1/2/5 x 10^n, so these counts give round tick steps
  const mantissa = max / 10 ** Math.floor(Math.log10(max))
  const TICKS = mantissa === 2 ? 4 : 5
  const y = (v: number) => M.top + PLOT_H - (v / max) * PLOT_H
  const colW = PLOT_W / GROUPS.length
  const cx = (i: number) => M.left + colW * (i + 0.5)

  return (
    <figure className="pharm-chart">
      <figcaption className="pharm-chart__title">
        {title} <span className="muted">({unit})</span>
      </figcaption>
      <div className="pharm-chart__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, one dot for each recording, split into groups`}>
          {Array.from({ length: TICKS + 1 }, (_, t) => {
            const v = (max / TICKS) * t
            return (
              <g key={t}>
                <line className="pharm-grid" x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} />
                <text className="pharm-axis" x={M.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle">
                  {fmt(v, max)}
                </text>
              </g>
            )
          })}
          {GROUPS.map((g, i) => {
            const vals = metric.groups[g].values
            const half = colW * 0.34
            return (
              <g key={g}>
                <text className="pharm-axis" x={cx(i)} y={H - 26} textAnchor="middle">
                  {GROUP_LABEL[g] === 'Social isolation' ? 'Isolation' : GROUP_LABEL[g]}
                </text>
                <text className="pharm-axis pharm-axis--muted" x={cx(i)} y={H - 8} textAnchor="middle">
                  n = {vals.length}
                </text>
                <line className="pharm-median" x1={cx(i) - half} x2={cx(i) + half} y1={y(median(vals))} y2={y(median(vals))} />
                <line className="pharm-mean" x1={cx(i) - half} x2={cx(i) + half} y1={y(mean(vals))} y2={y(mean(vals))} />
                {vals.map((v, j) => {
                  const px = cx(i) + jitter(j, vals.length) * colW * 0.22
                  const py = y(v)
                  const text = `${GROUP_LABEL[g]} recording ${j + 1} of ${vals.length} · ${v.toFixed(2)} ${unit}`
                  const show = () => setHover({ x: px / W, y: py / H, text })
                  return (
                    <g key={j} data-testid="recording-dot" data-group={g}>
                      <circle cx={px} cy={py} r={4.5} className="pharm-dot" style={{ fill: `var(--grp-${i})` }} aria-label={text} />
                      <circle
                        cx={px}
                        cy={py}
                        r={10}
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
          <div className="pharm-tip" role="status" style={{ left: `${hover.x * 100}%`, top: `${hover.y * 100}%` }}>
            {hover.text}
          </div>
        )}
      </div>
    </figure>
  )
}
