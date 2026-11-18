import { describe, expect, it } from 'vitest'
import { buildColorMap, buildCompareRows, formatSeconds, summarizeTimeline } from './behaviors'
import type { BehaviorSegment } from '../api/types'

const segments: BehaviorSegment[] = [
  { start_time: 0, end_time: 4, behavior_label: 'grooming', confidence: 0.9 },
  { start_time: 4, end_time: 6, behavior_label: 'rearing', confidence: 0.8 },
  { start_time: 6, end_time: 10, behavior_label: 'grooming', confidence: 0.7 },
]

describe('summarizeTimeline', () => {
  it('computes total duration and per-behavior time share, largest first', () => {
    const summary = summarizeTimeline(segments)
    expect(summary.duration).toBe(10)
    expect(summary.totals).toEqual([
      { label: 'grooming', seconds: 8, share: 0.8 },
      { label: 'rearing', seconds: 2, share: 0.2 },
    ])
  })

  it('handles an empty timeline without dividing by zero', () => {
    expect(summarizeTimeline([])).toEqual({ duration: 0, totals: [] })
  })

  it('does not mutate its input', () => {
    const frozen = Object.freeze([...segments].reverse())
    expect(() => summarizeTimeline(frozen)).not.toThrow()
  })
})

describe('buildCompareRows', () => {
  it('unions behaviors across control and treated and keeps the backend difference', () => {
    const rows = buildCompareRows({
      control: { grooming: 0.4, rearing: 0.6 },
      treated: { grooming: 0.1, digging: 0.9 },
      difference: { grooming: -0.3, rearing: -0.6, digging: 0.9 },
    })
    expect(rows.map((r) => r.label)).toEqual(['digging', 'rearing', 'grooming'])
    expect(rows.find((r) => r.label === 'rearing')).toEqual({ label: 'rearing', control: 0.6, treated: 0, difference: -0.6 })
  })

  it('falls back to treated minus control when the backend omits a difference', () => {
    const rows = buildCompareRows({ control: { a: 1 }, treated: { a: 3 }, difference: {} })
    expect(rows[0].difference).toBe(2)
  })
})

describe('buildColorMap', () => {
  it('gives every distinct label a distinct color', () => {
    const colors = buildColorMap(['grooming', 'rearing', 'investigation', 'grooming'])
    expect(Object.keys(colors).sort()).toEqual(['grooming', 'investigation', 'rearing'])
    expect(new Set(Object.values(colors)).size).toBe(3)
  })

  it('is independent of input order', () => {
    expect(buildColorMap(['b', 'a'])).toEqual(buildColorMap(['a', 'b']))
  })
})

describe('formatSeconds', () => {
  it('formats as m:ss.s', () => {
    expect(formatSeconds(0)).toBe('0:00.0')
    expect(formatSeconds(75.25)).toBe('1:15.3')
  })
})
