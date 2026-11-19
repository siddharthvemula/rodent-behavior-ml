import { describe, expect, it } from 'vitest'
import type { BehaviorSegment } from '../api/types'
import { boutStats, confidenceProfile, median, LOW_CONFIDENCE } from './boutStats'
import { axisTicks, changeAxisMax } from './changeScale'

const seg = (start: number, end: number, label: string, confidence: number): BehaviorSegment => ({
  start_time: start,
  end_time: end,
  behavior_label: label,
  confidence,
})

const segments = [
  seg(0, 10, 'other', 0.9),
  seg(10, 14, 'attack', 0.5),
  seg(14, 20, 'other', 0.8),
  seg(20, 22, 'attack', 0.95),
  seg(22, 40, 'investigation', 0.7),
]

describe('median', () => {
  it('handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBe(0)
  })
})

describe('boutStats', () => {
  it('returns rows in canonical order with bout counts and lengths', () => {
    const rows = boutStats(segments)
    expect(rows.map((r) => r.label)).toEqual(['attack', 'investigation', 'other'])
    const attack = rows[0]
    expect(attack.bouts).toBe(2)
    expect(attack.seconds).toBe(6)
    expect(attack.share).toBeCloseTo(6 / 40)
    expect(attack.medianBout).toBe(3)
    expect(attack.longestBout).toBe(4)
    expect(attack.confidences).toEqual([0.5, 0.95])
    expect(attack.minConfidence).toBe(0.5)
    expect(attack.maxConfidence).toBe(0.95)
    expect(attack.lowBouts).toBe(1)
  })

  it('is empty for no segments', () => {
    expect(boutStats([])).toEqual([])
  })
})

describe('confidenceProfile', () => {
  it('weights by time and finds the least certain segment', () => {
    const p = confidenceProfile(segments)
    // only the 4 s attack bout is below the threshold
    expect(p.highShare).toBeCloseTo(36 / 40)
    expect(p.lowSegments).toBe(1)
    expect(p.lowest?.confidence).toBe(0.5)
    expect(p.mean).toBeCloseTo((9 + 2 + 4.8 + 1.9 + 12.6) / 40)
  })

  it('treats exactly the threshold as high confidence', () => {
    expect(confidenceProfile([seg(0, 5, 'other', LOW_CONFIDENCE)]).highShare).toBe(1)
  })

  it('handles an empty recording', () => {
    expect(confidenceProfile([])).toEqual({ highShare: 0, mean: 0, lowest: null, lowSegments: 0 })
  })
})

describe('changeScale', () => {
  it('rounds up to the next 10% with a 10% floor', () => {
    expect(changeAxisMax([0.44, 0.1])).toBe(0.5)
    expect(changeAxisMax([0.5])).toBe(0.5)
    expect(changeAxisMax([0.01])).toBe(0.1)
    expect(changeAxisMax([0.57])).toBe(0.6) // step 20%, so the last gridline lands on the end
    expect(changeAxisMax([0.65])).toBe(0.8)
    expect(changeAxisMax([])).toBe(0.1)
  })
  it('puts gridlines at round percentages', () => {
    expect(axisTicks(0.1)).toEqual([0, 0.05, 0.1])
    expect(axisTicks(0.5)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5])
    expect(axisTicks(0.8)).toEqual([0, 0.2, 0.4, 0.6, 0.8])
    expect(axisTicks(1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
  })
})
