import type { CSSProperties } from 'react'
import type { BehaviorSegment } from '../api/types'
import { buildColorMap } from '../lib/behaviors'
import { behaviorInfo } from '../lib/behaviorInfo'
import { boutStats, LOW_CONFIDENCE } from '../lib/boutStats'
import { formatDuration, percent } from '../lib/summary'

interface BoutStatsProps {
  readonly segments: readonly BehaviorSegment[]
}

const seconds = (value: number) => (value < 10 ? `${value.toFixed(1)} s` : formatDuration(value))

/** Per-behavior bout counts and lengths, with each bout's confidence plotted as a dot on a 0-100% strip. */
export function BoutStats({ segments }: BoutStatsProps) {
  const rows = boutStats(segments)
  if (rows.length === 0) return null
  const colors = buildColorMap(rows.map((r) => r.label))

  return (
    <section className="bout-stats" aria-label="Per-behavior breakdown">
      <h3 className="viz-heading">Per-behavior breakdown</h3>
      <p className="muted small viz-sub">
        A bout is one unbroken stretch of a behavior. Each dot is one bout's confidence; the tick marks the median.
      </p>
      <div className="bout-stats__scroll">
        <table className="data-table bout-stats__table" aria-label="Bouts and confidence by behavior">
          <thead>
            <tr>
              <th scope="col">Behavior</th>
              <th scope="col" className="num">Bouts</th>
              <th scope="col" className="num">Time</th>
              <th scope="col" className="num">Median bout</th>
              <th scope="col" className="num">Longest</th>
              <th scope="col" className="bout-stats__dist-col">Confidence per bout</th>
              <th scope="col" className="num">Median</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">
                  <span className="swatch" style={{ background: colors[r.label] }} aria-hidden="true" />
                  {behaviorInfo(r.label).title}
                </th>
                <td className="num">{r.bouts}</td>
                <td className="num">{percent(r.share)}</td>
                <td className="num">{seconds(r.medianBout)}</td>
                <td className="num">{seconds(r.longestBout)}</td>
                <td
                  className="bout-stats__dist-col"
                  aria-label={`Confidence ranges from ${percent(r.minConfidence)} to ${percent(r.maxConfidence)}${r.lowBouts ? `; ${r.lowBouts} of ${r.bouts} bouts below ${percent(LOW_CONFIDENCE)}` : ''}`}
                >
                  <div className="strip" aria-hidden="true" style={{ ['--beh' as string]: colors[r.label] } as CSSProperties}>
                    <span className="strip__low" style={{ width: `${LOW_CONFIDENCE * 100}%` }} />
                    {r.confidences.map((c, i) => (
                      <span key={i} className={`strip__dot${c < LOW_CONFIDENCE ? ' is-low' : ''}`} style={{ left: `${c * 100}%` }} />
                    ))}
                    <span className="strip__median" style={{ left: `${r.medianConfidence * 100}%` }} />
                  </div>
                </td>
                <td className="num">{percent(r.medianConfidence)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot aria-hidden="true">
            <tr>
              <td colSpan={5} />
              <td className="bout-stats__dist-col">
                <div className="strip-axis muted small">
                  <span style={{ left: '0%' }}>0%</span>
                  <span style={{ left: `${LOW_CONFIDENCE * 100}%` }}>{percent(LOW_CONFIDENCE)}</span>
                  <span style={{ left: '100%' }}>100%</span>
                </div>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
