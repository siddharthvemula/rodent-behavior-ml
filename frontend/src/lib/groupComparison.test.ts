import { describe, expect, it } from 'vitest'
import statsRaw from '../data/group_comparison.json'
import {
  BEHAVIOR_SPECS,
  CONTRASTS,
  FAMILY_SIZE,
  GROUPS,
  KINDS,
  allComparisons,
  effectAxis,
  familyOutcome,
  forestRows,
  groupComparison,
  metricKey,
  parseGroupComparison,
  summarizeBehavior,
  zeroShare,
} from './groupComparison'

const clone = () => JSON.parse(JSON.stringify(statsRaw))

describe('committed group_comparison.json', () => {
  it('parses and covers the 36 planned comparisons: 6 behaviors x 2 metrics x 3 groups vs naive', () => {
    expect(FAMILY_SIZE).toBe(36)
    expect(allComparisons(groupComparison)).toHaveLength(36)
    expect(GROUPS).toEqual(['naive', 'stress', 'isolation', 'mated'])
    for (const m of Object.values(groupComparison.metrics)) expect(m.comparisons.map((c) => c.group)).toEqual([...CONTRASTS])
  })

  it('uses only the six behaviors with uniform coverage, and never the excluded ones', () => {
    expect(BEHAVIOR_SPECS.map((b) => b.key)).toEqual(['attack', 'dominancegroom', 'sniff', 'sniffgenital', 'dig', 'selfgroom'])
    expect(Object.keys(groupComparison.metrics).some((k) => /allogroom|escape/.test(k))).toBe(false)
  })

  it('carries one dot per recording: 50 recordings per metric, group sizes from the data', () => {
    expect(groupComparison.design.groups).toEqual({ naive: 8, stress: 14, isolation: 14, mated: 14 })
    for (const m of Object.values(groupComparison.metrics)) expect(GROUPS.reduce((a, g) => a + m.groups[g].values.length, 0)).toBe(50)
  })

  it('has exact p-values and Holm >= raw for every comparison', () => {
    for (const { comparison: c } of allComparisons(groupComparison)) {
      expect(c.p_method).toBe('exact')
      expect(c.p_holm!).toBeGreaterThanOrEqual(c.p_perm)
    }
  })

  it('never claims more than the statistics support: the family outcome follows the data', () => {
    const out = familyOutcome(groupComparison)
    const direct = allComparisons(groupComparison).filter((x) => (x.comparison.p_holm ?? 1) < 0.05).length
    expect(out.significant).toBe(direct)
    expect(out.expectedByChance).toBeCloseTo(36 * 0.05)
  })

  it('records that re-running without time-shifted recordings was infeasible rather than inventing it', () => {
    const ts = groupComparison.time_shift
    expect(ts.unshifted_by_group.naive).toBeLessThan(3)
    expect(ts.sensitivity_without_shifted).toBeNull()
  })
})

describe('parseGroupComparison', () => {
  it('rejects malformed regenerations', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cases: [string, (d: any) => void, RegExp][] = [
      ['a missing metric', (d) => delete d.metrics.attack_time_pct, /metrics/],
      ['reordered contrasts', (d) => d.metrics.attack_time_pct.comparisons.reverse(), /expected/],
      ['a Holm p below the raw p', (d) => (d.metrics.attack_time_pct.comparisons[0].p_holm = 0), /adjusted p smaller/],
      ['a non-exact test', (d) => (d.metrics.attack_time_pct.comparisons[0].p_method = 'monte-carlo'), /exact/],
      ['a changed naive size', (d) => d.metrics.dig_time_pct.groups.naive.values.pop(), /number of recordings/],
      ['a reversed interval', (d) => (d.metrics.sniff_time_pct.comparisons[1].g_ci = [2, -2]), /reversed/],
      ['a changed behavior list', (d) => d.design.behaviors.push('escape'), /behaviors/],
      ['a missing citation', (d) => delete d.dataset.citation, /dataset/],
      ['a non-finite value', (d) => (d.metrics.dig_time_pct.groups.stress.values[0] = null), /finite/],
    ]
    for (const [name, mutate, re] of cases) {
      const d = clone()
      mutate(d)
      expect(() => parseGroupComparison(d), name).toThrow(re)
    }
  })
})

describe('derived values', () => {
  it('forest rows are ordered behavior-major and match the metrics', () => {
    for (const k of KINDS) {
      const rows = forestRows(groupComparison, k.key)
      expect(rows).toHaveLength(18)
      expect(rows.map((r) => r.behavior)).toEqual(BEHAVIOR_SPECS.flatMap((b) => [b.key, b.key, b.key]))
      expect(rows[0].g).toBe(groupComparison.metrics[metricKey('attack', k.key)].comparisons[0].hedges_g)
    }
  })

  it('draws every interval inside the shared axis', () => {
    const axis = effectAxis(groupComparison)
    for (const { comparison: c } of allComparisons(groupComparison)) {
      expect(Math.abs(c.g_ci[0])).toBeLessThanOrEqual(axis.lim)
      expect(Math.abs(c.g_ci[1])).toBeLessThanOrEqual(axis.lim)
    }
    expect(axis.ticks[0]).toBe(-axis.lim)
  })

  it('summarizes a behavior from its numbers', () => {
    const text = summarizeBehavior(groupComparison, 'attack')
    expect(text).toMatch(/time in behavior, effect size vs naive: stress [+−]\d/)
    expect(text).toMatch(/bout frequency/)
    const planted = clone()
    planted.metrics.attack_time_pct.comparisons[2].p_perm = 0.0001
    planted.metrics.attack_time_pct.comparisons[2].p_holm = 0.001
    expect(summarizeBehavior(parseGroupComparison(planted), 'attack')).toMatch(/1 remain significant/)
  })

  it('computes the share of recordings with no bout per group', () => {
    const z = zeroShare(groupComparison, 'attack')
    for (const g of GROUPS) expect(z[g]).toBe(groupComparison.metrics.attack_time_pct.groups[g].n_zero / groupComparison.design.groups[g])
  })
})
