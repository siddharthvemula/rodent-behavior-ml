import { describe, expect, it } from 'vitest'
import { groupByDose, jitter, mean, median, niceMax, openField, parseOpenField } from './openField'

describe('openField data', () => {
  it('has 4 dose groups of 8 mice', () => {
    const groups = groupByDose(openField.mice)
    expect(groups.map((g) => g.label)).toEqual(['Saline', '1 mg/kg', '3 mg/kg', '6 mg/kg'])
    expect(groups.every((g) => g.mice.length === 8)).toBe(true)
  })

  it('rejects malformed data', () => {
    expect(() => parseOpenField({ mice: [] })).toThrow()
    const bad = { ...openField, mice: [{ ...openField.mice[0], center_pct: NaN }] }
    expect(() => parseOpenField(bad)).toThrow(/center_pct/)
  })

  it('records the CC BY attribution', () => {
    expect(openField.dataset.license).toBe('CC BY 4.0')
    expect(openField.dataset.citation).toContain('10.5281/zenodo.8188683')
  })
})

describe('helpers', () => {
  it('mean and median', () => {
    expect(mean([1, 2, 6])).toBe(3)
    expect(median([5, 1, 3])).toBe(3)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
  it('niceMax rounds up to 1/2/5 steps', () => {
    expect(niceMax(0.3)).toBe(0.5)
    expect(niceMax(210000)).toBe(500000)
    expect(niceMax(4.1)).toBe(5)
  })
  it('jitter stays in range and is deterministic', () => {
    for (let i = 0; i < 8; i++) expect(Math.abs(jitter(i, 8))).toBeLessThanOrEqual(1)
    expect(jitter(3, 8)).toBe(jitter(3, 8))
    expect(jitter(0, 1)).toBe(0)
  })
})
