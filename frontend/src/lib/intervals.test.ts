import { describe, expect, it } from 'vitest'
import { differenceVerdict, formatDifferenceRange, formatRange, verdictText } from './intervals'

describe('differenceVerdict', () => {
  it('is beyond noise only when the interval excludes zero', () => {
    expect(differenceVerdict([0.02, 0.28])).toBe('beyond')
    expect(differenceVerdict([-0.3, -0.01])).toBe('beyond')
    expect(differenceVerdict([-0.05, 0.1])).toBe('within')
    expect(differenceVerdict([0, 0.1])).toBe('within') // touching zero is not clear of it
    expect(differenceVerdict([0, 0])).toBe('within')
  })
  it('has no verdict without an interval', () => {
    expect(differenceVerdict(undefined)).toBeNull()
  })
  it('words it as noise, never as significance', () => {
    expect(verdictText('beyond')).toBe('beyond noise')
    expect(verdictText('within')).toBe('within noise')
  })
})

describe('formatting', () => {
  it('formats ranges', () => {
    expect(formatRange([0.021, 0.094])).toBe('2%–9%')
    expect(formatDifferenceRange([-0.24, 0.14])).toBe('−24 to +14 pts')
    expect(formatDifferenceRange([0.02, 0.28])).toBe('+2 to +28 pts')
  })
})
