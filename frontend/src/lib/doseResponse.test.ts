import { describe, expect, it } from 'vitest'
import richRaw from '../data/open_field_rich.json'
import statsRaw from '../data/dose_response.json'
import {
  DOSES,
  PRIMARY_ORDER,
  PRIMARY_SPECS,
  doseResponse,
  effectAxis,
  formatP,
  formatSigned,
  forestRows,
  isSignificant,
  mergeRich,
  parseDoseResponse,
  primaryMetric,
  richMice,
  summarizeComparisons,
  type MetricStats,
} from './doseResponse'
import { openField } from './openField'

const clone = () => JSON.parse(JSON.stringify(statsRaw))

function metric(comps: { dose: number; g: number; holm: number }[]): MetricStats {
  return {
    label: 'x',
    shape: 'monotonic',
    per_dose: [],
    comparisons: comps.map((c) => ({
      dose_mg_kg: c.dose,
      mean_diff: 0,
      mean_diff_ci: [0, 0],
      hedges_g: c.g,
      g_ci: [-1, 1],
      p_perm: c.holm,
      p_holm: c.holm,
      p_holm_all: c.holm,
    })),
  }
}

describe('committed dose_response.json', () => {
  it('parses and covers the four planned metrics and the saline-referenced doses', () => {
    expect(DOSES).toEqual([0, 1, 3, 6])
    for (const k of PRIMARY_ORDER) expect(primaryMetric(doseResponse, k).comparisons.map((c) => c.dose_mg_kg)).toEqual([1, 3, 6])
    expect(PRIMARY_SPECS.map((s) => s.key)).toEqual([...PRIMARY_ORDER])
  })

  it('records the frame rate as inferred, never as fact', () => {
    expect(doseResponse.phase_b.time_axis.status).toMatch(/inferred/i)
    expect(doseResponse.phase_b.time_axis.fps_assumed).toBe(30)
  })

  it('guards the wording hard-coded in the page: immobility cutoff 1 px/frame, conclusions stable at 0.5 and 2', () => {
    expect(richRaw.parameters.immobile_px_per_frame).toBe(1)
    expect(richRaw.parameters.sensitivity_px_per_frame).toEqual([0.5, 1, 2])
    const rawSig = (m: MetricStats) => m.comparisons.filter((c) => c.p_perm < 0.05).map((c) => c.dose_mg_kg)
    const s = doseResponse.phase_b
    const same = (primary: string, others: string[]) => {
      for (const o of others) expect(rawSig(s.sensitivity[o])).toEqual(rawSig(s.primary[primary]))
    }
    same('immobility_pct', ['immobility_pct_t0.5', 'immobility_pct_t2'])
    same('center_pct_moving', ['center_pct_moving_t0.5', 'center_pct_moving_t2'])
  })

  it('has adjusted p-values that never fall below the raw ones', () => {
    for (const k of PRIMARY_ORDER) {
      for (const c of primaryMetric(doseResponse, k).comparisons) {
        expect(c.p_holm!).toBeGreaterThanOrEqual(c.p_perm - 1e-12)
        expect(c.p_holm_all!).toBeGreaterThanOrEqual(c.p_holm! - 1e-12)
      }
    }
  })
})

describe('parseDoseResponse', () => {
  it('rejects malformed input loudly', () => {
    expect(() => parseDoseResponse({})).toThrow(/malformed/)
    const a = clone()
    a.metrics.distance_arena_widths.comparisons[0].p_perm = 1.5
    expect(() => parseDoseResponse(a)).toThrow(/probability/)
    const b = clone()
    b.metrics.center_pct.comparisons[1].g_ci = [3, -3]
    expect(() => parseDoseResponse(b)).toThrow(/reversed/)
    const c = clone()
    c.phase_b.primary.immobility_pct.comparisons.pop()
    expect(() => parseDoseResponse(c)).toThrow(/one comparison per non-saline dose/)
    const d = clone()
    d.phase_b.time_course.doses[2].bins.pop()
    expect(() => parseDoseResponse(d)).toThrow(/bins/)
    const e = clone()
    e.phase_b.time_axis.status = 'verified'
    expect(() => parseDoseResponse(e)).toThrow(/inferred/)
  })

  it('rejects an adjusted p smaller than the raw p, and a missing planned metric', () => {
    const a = clone()
    a.metrics.distance_arena_widths.comparisons[0].p_holm = a.metrics.distance_arena_widths.comparisons[0].p_perm / 2
    expect(() => parseDoseResponse(a)).toThrow(/adjusted p smaller/)
    const b = clone()
    delete b.phase_b.primary.immobility_pct
    expect(() => parseDoseResponse(b)).toThrow(/immobility_pct/)
  })

  it('rejects non-finite numbers', () => {
    const a = clone()
    a.phase_b.time_course.doses[0].bins[0].mean = null
    expect(() => parseDoseResponse(a)).toThrow(/finite/)
  })
})

describe('formatting', () => {
  it('formats p-values and signed numbers', () => {
    expect(formatP(0.0004)).toBe('< 0.001')
    expect(formatP(0.0039)).toBe('0.004')
    expect(formatP(0.136)).toBe('0.14')
    expect(formatSigned(-2.434)).toBe('−2.43')
    expect(formatSigned(1.6, 1)).toBe('+1.6')
  })
})

describe('summarizeComparisons', () => {
  const words = { up: 'more', down: 'less' }

  it('names the doses that differ, with direction and p, and those that do not', () => {
    const s = summarizeComparisons(metric([{ dose: 1, g: 0.2, holm: 0.6 }, { dose: 3, g: -2, holm: 0.003 }, { dose: 6, g: -4, holm: 0.0004 }]), words)
    expect(s).toBe('Less than saline at 3 mg/kg and 6 mg/kg (Holm p = 0.003 and p < 0.001); not distinguishable from saline at 1 mg/kg.')
  })

  it('handles mixed directions and the nothing-significant case', () => {
    const mixed = summarizeComparisons(metric([{ dose: 1, g: 2, holm: 0.01 }, { dose: 3, g: 0.1, holm: 0.9 }, { dose: 6, g: -2, holm: 0.02 }]), words)
    expect(mixed).toMatch(/^More than saline at 1 mg\/kg \(Holm p = 0\.01\); less than saline at 6 mg\/kg \(Holm p = 0\.02\)/)
    expect(mixed).toMatch(/not distinguishable from saline at 3 mg\/kg\.$/)
    expect(summarizeComparisons(metric([{ dose: 1, g: 0.1, holm: 0.9 }, { dose: 3, g: 0.2, holm: 0.8 }, { dose: 6, g: 0.3, holm: 0.7 }]), words)).toBe(
      'No dose clearly different from saline.',
    )
  })

  it('never calls a comparison different unless its Holm p is below 0.05', () => {
    for (const spec of PRIMARY_SPECS) {
      const m = primaryMetric(doseResponse, spec.key)
      const s = summarizeComparisons(m, spec)
      for (const c of m.comparisons) {
        const named = new RegExp(`(than saline at [^;.]*\\b${c.dose_mg_kg} mg/kg)`).test(s.split('; not distinguishable')[0])
        expect(named).toBe(isSignificant(c))
      }
    }
  })
})

describe('mergeRich', () => {
  it('attaches the phase B metrics to every mouse by id', () => {
    expect(richMice).toHaveLength(32)
    for (const m of richMice) {
      expect(Number.isFinite(m.immobility_pct)).toBe(true)
      expect(m.center_pct_moving).toBeGreaterThan(0)
    }
    expect(richMice.map((m) => m.id)).toEqual(openField.mice.map((m) => m.id))
  })

  it('refuses mismatched or malformed input', () => {
    expect(() => mergeRich(openField.mice, { mice: [] })).toThrow(/same mice/)
    const swapped = { mice: [...richRaw.mice].reverse() }
    expect(() => mergeRich(openField.mice, swapped)).toThrow(/expected/)
    const nan = { mice: richRaw.mice.map((m, i) => (i === 0 ? { ...m, immobility_pct: NaN } : m)) }
    expect(() => mergeRich(openField.mice, nan)).toThrow(/immobility_pct/)
  })
})

describe('forest geometry', () => {
  it('builds one row per non-saline dose with significance from the Holm p', () => {
    const rows = forestRows(primaryMetric(doseResponse, 'immobility_pct'))
    expect(rows.map((r) => r.dose)).toEqual([1, 3, 6])
    for (const r of rows) expect(r.significant).toBe(r.pHolm < 0.05)
  })

  it('uses one symmetric axis that contains every interval', () => {
    const { lim, ticks } = effectAxis(doseResponse)
    expect(ticks[0]).toBe(-lim)
    expect(ticks[ticks.length - 1]).toBe(lim)
    expect(ticks).toContain(0)
    for (const k of PRIMARY_ORDER) {
      for (const c of primaryMetric(doseResponse, k).comparisons) {
        expect(Math.abs(c.g_ci[0])).toBeLessThanOrEqual(lim)
        expect(Math.abs(c.g_ci[1])).toBeLessThanOrEqual(lim)
      }
    }
  })
})
