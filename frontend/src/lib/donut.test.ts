import { describe, expect, it } from 'vitest'
import { donutSegments } from './donut'

const slice = (label: string, value: number) => ({ label, value, color: 'red' })

describe('donutSegments', () => {
  it('sizes segments in proportion to their share and tiles the ring', () => {
    const segs = donutSegments([slice('a', 0.5), slice('b', 0.3), slice('c', 0.2)])
    expect(segs.map((s) => s.label)).toEqual(['a', 'b', 'c'])
    expect(segs.map((s) => Math.round(s.share * 100))).toEqual([50, 30, 20])
    // each segment starts where the previous one ended (plus the half-gap)
    expect(segs[1].start).toBeGreaterThan(segs[0].start + segs[0].length)
    expect(segs[2].start + segs[2].length).toBeLessThanOrEqual(100)
    // the lengths are proportional once the fixed gap is added back
    const full = segs.map((s) => s.length + 1.1)
    expect(full[0] / full[2]).toBeCloseTo(2.5, 1)
  })

  it('drops zero slices and gives a single slice the whole ring with no gap', () => {
    const segs = donutSegments([slice('a', 0), slice('b', 1), slice('c', 0)])
    expect(segs).toHaveLength(1)
    expect(segs[0].label).toBe('b')
    expect(segs[0].start).toBe(0)
    expect(segs[0].length).toBe(100)
  })

  it('normalizes shares so rounding in the data cannot leave a hole', () => {
    const segs = donutSegments([slice('a', 0.49), slice('b', 0.49)]) // sums to 0.98
    expect(segs[0].share).toBeCloseTo(0.5)
    expect(segs[1].start + segs[1].length).toBeGreaterThan(98)
  })

  it('draws nothing when everything is zero', () => {
    expect(donutSegments([slice('a', 0), slice('b', 0)])).toEqual([])
    expect(donutSegments([])).toEqual([])
  })

  it('never gives a tiny segment a negative or invisible length', () => {
    const segs = donutSegments([slice('a', 0.999), slice('b', 0.001)])
    expect(segs.every((s) => s.length > 0)).toBe(true)
  })
})
