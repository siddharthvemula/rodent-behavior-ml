import type { CompareResult } from '../api/types'
import { buildCompareRows } from '../lib/behaviors'
import { ChangeChart } from './ChangeChart'

interface ComparisonChartProps {
  readonly result: CompareResult
}

// ARCHITECTURE.md says "per-behavior frequency" without fixing the unit
// (fraction of time vs. bout count), so the table shows values as-is; the
// change chart above it scales its axis to the data.
const formatValue = (value: number) => value.toFixed(2)
const formatDifference = (value: number) => `${value > 0 ? '+' : ''}${formatValue(value)}`

export function ComparisonChart({ result }: ComparisonChartProps) {
  const rows = buildCompareRows(result)
  if (rows.length === 0) {
    return <p className="empty">No behaviors detected in either recording.</p>
  }

  return (
    <section className="result" aria-label="Comparison of two recordings">
      <ChangeChart result={result} />

      <table className="data-table compare-table" aria-label="Behavior frequency comparison">
        <thead>
          <tr>
            <th scope="col">Behavior</th>
            <th scope="col" className="num">Recording A</th>
            <th scope="col" className="num">Recording B</th>
            <th scope="col" className="num">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td className="num">{formatValue(r.control)}</td>
              <td className="num">{formatValue(r.treated)}</td>
              <td className="num diff">
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
