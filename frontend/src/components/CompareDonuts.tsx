import { useState } from 'react'
import type { CompareResult } from '../api/types'
import { buildColorMap, buildCompareRows } from '../lib/behaviors'
import { orderLabels, summarizeComparison } from '../lib/summary'
import { useRecordingNames } from '../lib/recordingNames'
import { BehaviorKey } from './BehaviorKey'
import { Donut } from './Donut'

/** Each recording's share of time per behavior as a pair of donuts (Detail view). */
export function CompareDonuts({ result }: { readonly result: CompareResult }) {
  const names = useRecordingNames()
  // The behavior highlighted across both donuts and the key (hover / focus), or null.
  const [active, setActive] = useState<string | null>(null)
  const rowsByLabel = new Map(buildCompareRows(result).map((r) => [r.label, r]))
  const labels = orderLabels([...rowsByLabel.keys()])
  if (labels.length === 0) return null
  const colors = buildColorMap(labels)
  const defaultLabel = summarizeComparison(result).lead?.label ?? labels[0]
  const slices = (group: 'control' | 'treated') => labels.map((l) => ({ label: l, value: rowsByLabel.get(l)![group], color: colors[l] }))

  return (
    <section className="card donut-card" aria-label="Share of each recording">
      <h3>Share of each recording</h3>
      <div className="donuts">
        <div className="donuts__pair donuts__pair--row">
          <Donut name={names.a} slices={slices('control')} defaultLabel={defaultLabel} active={active} onActiveChange={setActive} />
          <Donut name={names.b} slices={slices('treated')} defaultLabel={defaultLabel} active={active} onActiveChange={setActive} />
        </div>
        <BehaviorKey labels={labels} colors={colors} active={active} onActiveChange={setActive} />
      </div>
    </section>
  )
}
