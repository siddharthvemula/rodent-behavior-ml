// Reading the backend's bootstrap intervals (see api/types.ts CompareIntervals).
// These say how stable each recording's own estimate is. They do NOT show that
// two animals or groups differ, and the wording here is careful about that.
import type { Interval } from '../api/types'

export type Verdict = 'beyond' | 'within'

/**
 * "beyond noise" when the interval for the difference excludes zero, i.e. the
 * gap between A and B is larger than the resampling noise within these two
 * recordings; otherwise "within noise".
 */
export function differenceVerdict(interval: Interval | undefined): Verdict | null {
  if (!interval) return null
  return interval[0] > 0 || interval[1] < 0 ? 'beyond' : 'within'
}

export const verdictText = (v: Verdict) => (v === 'beyond' ? 'beyond noise' : 'within noise')

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`
const signedPts = (fraction: number) => {
  const pts = Math.round(fraction * 100)
  return `${pts > 0 ? '+' : pts < 0 ? '−' : ''}${Math.abs(pts)}`
}

/** "2%–9%" */
export const formatRange = (i: Interval) => `${pct(i[0])}–${pct(i[1])}`
/** "+8 to +23 pts" */
export const formatDifferenceRange = (i: Interval) => `${signedPts(i[0])} to ${signedPts(i[1])} pts`
