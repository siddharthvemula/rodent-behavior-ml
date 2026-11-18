import type { CompareResult } from '../api/types'
import { buildCompareRows } from '../lib/behaviors'

interface ComparisonChartProps {
  readonly result: CompareResult
}

// ARCHITECTURE.md says "per-behavior frequency" without fixing the unit
// (fraction of time vs. bout count), so values are shown as-is and bars are
// scaled to the largest value rather than assuming a 0-1 range.
const formatValue = (value: number) => value.toFixed(2)
const formatDifference = (value: number) => `${value > 0 ? '+' : ''}${formatValue(value)}`

export function ComparisonChart({ result }: ComparisonChartProps) {
  const rows = buildCompareRows(result)
  if (rows.length === 0) {
    return <p className="empty">No behaviors detected in either recording.</p>
  }

  const maxValue = Math.max(...rows.flatMap((r) => [r.control, r.treated])) || 1
  const barWidth = (value: number) => `${(value / maxValue) * 100}%`

  return (
    <section className="result" aria-label="Comparison of two recordings">
      <ul className="legend">
        <li>
          <span className="swatch swatch--control" aria-hidden="true" /> Recording A
        </li>
        <li>
          <span className="swatch swatch--treated" aria-hidden="true" /> Recording B
        </li>
      </ul>

      <table className="data-table compare-table" aria-label="Behavior frequency comparison">
        <thead>
          <tr>
            <th scope="col">Behavior</th>
            <th scope="col" className="bars">
              Recording A vs recording B
            </th>
            <th scope="col" className="num">Recording A</th>
            <th scope="col" className="num">Recording B</th>
            <th scope="col" className="num">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td className="bars" aria-hidden="true">
                <div className="bar bar--control" style={{ width: barWidth(r.control) }} />
                <div className="bar bar--treated" style={{ width: barWidth(r.treated) }} />
              </td>
              <td className="num">{formatValue(r.control)}</td>
              <td className="num">{formatValue(r.treated)}</td>
              <td className={`num diff ${r.difference > 0 ? 'diff--up' : r.difference < 0 ? 'diff--down' : ''}`}>
                {formatDifference(r.difference)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted footnote">Difference = recording B − recording A, as reported by the backend. This compares behavior between two recordings; it does not measure a treatment effect.</p>
    </section>
  )
}
