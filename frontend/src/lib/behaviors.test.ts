import { describe, expect, it } from 'vitest'
import { buildColorMap, buildCompareRows, formatSeconds, summarizeTimeline } from './behaviors'
import type { BehaviorSegment } from '../api/types'

const segments: BehaviorSegment[] = [
  { start_time: 0, end_time: 4, behavior_label: 'investigation', confidence: 0.9 },
  { start_time: 4, end_time: 6, behavior_label: 'other', confidence: 0.8 },
  { start_time: 6, end_time: 10, behavior_label: 'investigation', confidence: 0.7 },
]

describe('summarizeTimeline', () => {
  it('computes total duration and per-behavior time share, largest first', () => {
    const summary = summarizeTimeline(segments)
    expect(summary.duration).toBe(10)
    expect(summary.totals).toEqual([
      { label: 'investigation', seconds: 8, share: 0.8 },
      { label: 'other', seconds: 2, share: 0.2 },
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
      control: { attack: 0.4, other: 0.6 },
      treated: { attack: 0.1, mount: 0.9 },
      difference: { attack: -0.3, other: -0.6, mount: 0.9 },
    })
    expect(rows.map((r) => r.label)).toEqual(['mount', 'other', 'attack'])
    expect(rows.find((r) => r.label === 'other')).toEqual({ label: 'other', control: 0.6, treated: 0, difference: -0.6 })
  })

  it('falls back to treated minus control when the backend omits a difference', () => {
    const rows = buildCompareRows({ control: { a: 1 }, treated: { a: 3 }, difference: {} })
    expect(rows[0].difference).toBe(2)
  })
})

describe('buildColorMap', () => {
  const ALL = ['attack', 'investigation', 'mount', 'other']

  it('gives every behavior in the fixed vocabulary a distinct color', () => {
    const colors = buildColorMap(ALL)
    expect(Object.keys(colors).sort()).toEqual(ALL)
    expect(new Set(Object.values(colors)).size).toBe(4)
  })

  it('gives a label the same color no matter which other labels are present', () => {
    const full = buildColorMap(ALL)
    for (const label of ALL) {
      expect(buildColorMap([label])[label]).toBe(full[label])
    }
    expect(buildColorMap(['other', 'investigation']).investigation).toBe(full.investigation)
  })

  it('is independent of input order', () => {
    expect(buildColorMap(['other', 'attack'])).toEqual(buildColorMap(['attack', 'other']))
  })

  it('still gives labels outside the vocabulary distinct colors that do not collide with known ones', () => {
    const colors = buildColorMap([...ALL, 'zzz', 'aaa'])
    expect(new Set(Object.values(colors)).size).toBe(6)
    expect(colors.aaa).not.toBe(colors.zzz)
  })
})

describe('formatSeconds', () => {
  it('formats as m:ss.s', () => {
    expect(formatSeconds(0)).toBe('0:00.0')
    expect(formatSeconds(75.25)).toBe('1:15.3')
  })
})
