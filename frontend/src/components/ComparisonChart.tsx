import type { CompareIntervals, CompareResult } from '../api/types'
import { formatDifferenceRange } from '../lib/intervals'
import { buildCompareRows } from '../lib/behaviors'
import { ChangeChart } from './ChangeChart'
import { ModelTrust } from './ModelTrust'
import { lower, useRecordingNames } from '../lib/recordingNames'

interface ComparisonChartProps {
  readonly result: CompareResult
  readonly intervals?: CompareIntervals | null
}

// ARCHITECTURE.md says "per-behavior frequency" without fixing the unit
// (fraction of time vs. bout count), so the table shows values as-is; the
// change chart above it scales its axis to the data.
const formatValue = (value: number) => value.toFixed(2)
const formatDifference = (value: number) => `${value > 0 ? '+' : ''}${formatValue(value)}`

export function ComparisonChart({ result, intervals = null }: ComparisonChartProps) {
  const names = useRecordingNames()
  const rows = buildCompareRows(result)
  if (rows.length === 0) {
    return <p className="empty">No behaviors detected in either recording.</p>
  }

  // The named behavior with the biggest change: the one the reader will care most about trusting.
  const focus = rows.find((r) => r.label !== 'other' && r.difference !== 0)?.label ?? null

  return (
    <section className="result" aria-label="Comparison of two recordings">
      <ChangeChart result={result} intervals={intervals} />

      <table className="data-table compare-table" aria-label="Behavior frequency comparison">
        <thead>
          <tr>
            <th scope="col">Behavior</th>
            <th scope="col" className="num">{names.a}</th>
            <th scope="col" className="num">{names.b}</th>
            <th scope="col" className="num">Difference</th>
            {intervals && <th scope="col" className="num">95% range of difference</th>}
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
              {intervals && (
                <td className="num">{intervals.difference[r.label] ? formatDifferenceRange(intervals.difference[r.label]) : '–'}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted footnote">Difference = {lower(names.b)} − {lower(names.a)}, as reported by the backend. This compares behavior between two recordings; it does not measure a treatment effect.</p>
      <ModelTrust highlight={focus} />
    </section>
  )
}
