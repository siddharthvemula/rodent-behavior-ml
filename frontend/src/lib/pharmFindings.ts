/** The headline of each section of the Pharmacology tab, computed from the same numbers as its charts. */
import { DOSES, PRIMARY_SPECS, isSignificant, primaryMetric, type DoseResponse, type PrimarySpec } from './doseResponse'
import { pText } from './groupComparison'
import { doseLabel, type MouseMetrics } from './openField'

const TOP_DOSE = DOSES[DOSES.length - 1]

export interface LeadEffect {
  readonly spec: PrimarySpec
  readonly doseName: string
  readonly g: number
  readonly pText: string
  /** The headline number: its sign and whole-number size, kept apart so the size can count up. */
  readonly sign: '−' | '+'
  readonly size: number
  readonly statUnit: string
  readonly spoken: string
  readonly sentence: string
}

/**
 * The planned comparison with the largest effect size among those significant after correction, or null if none is.
 * Distance has no natural unit for a reader, so its difference is shown relative to saline; the other metrics are
 * already percentages, so theirs are shown in points.
 */
export function leadDoseEffect(stats: DoseResponse): LeadEffect | null {
  const [best] = PRIMARY_SPECS.flatMap((spec) =>
    primaryMetric(stats, spec.key).comparisons.filter(isSignificant).map((c) => ({ spec, c })),
  ).sort((a, b) => Math.abs(b.c.hedges_g) - Math.abs(a.c.hedges_g))
  if (!best) return null
  const { spec, c } = best
  const perDose = primaryMetric(stats, spec.key).per_dose
  const saline = perDose[0].mean
  const treated = perDose.find((d) => d.dose_mg_kg === c.dose_mg_kg)!.mean
  const relative = spec.key === 'distance_arena_widths'
  const change = relative ? ((treated - saline) / saline) * 100 : treated - saline
  const size = Math.round(Math.abs(change))
  const doseName = doseLabel(c.dose_mg_kg)
  return {
    spec,
    doseName,
    g: c.hedges_g,
    pText: pText(c.p_holm ?? 1),
    sign: change < 0 ? '−' : '+',
    size,
    statUnit: relative ? '%' : 'pts',
    spoken: `${size} ${relative ? 'percent' : 'percentage points'} ${change < 0 ? 'lower' : 'higher'} than saline`,
    sentence: relative
      ? `At ${doseName}, mice covered ${Math.round(treated)} arena widths vs ${Math.round(saline)} on saline`
      : `At ${doseName}, ${spec.title.toLowerCase()} averaged ${Math.round(treated)}% vs ${Math.round(saline)}% on saline`,
  }
}

export interface Count {
  readonly count: number
  readonly of: number
  readonly doseName: string
  readonly sentence: string
}

/** How many top-dose mice traveled less than every saline mouse. */
export function miceBelowAllSaline(mice: readonly MouseMetrics[]): Count {
  const floor = Math.min(...mice.filter((m) => m.dose_mg_kg === 0).map((m) => m.distance_px))
  const top = mice.filter((m) => m.dose_mg_kg === TOP_DOSE)
  const count = top.filter((m) => m.distance_px < floor).length
  const doseName = doseLabel(TOP_DOSE)
  return { count, of: top.length, doseName, sentence: `${count} of ${top.length} mice on ${doseName} traveled less than every saline mouse` }
}

/** In how many time bins the top dose's mean distance was below saline's. */
export function binsBelowSaline(stats: DoseResponse): Count {
  const series = stats.phase_b.time_course.doses
  const saline = series[0].bins
  const top = series[series.length - 1].bins
  const count = top.filter((b, i) => b.mean < saline[i].mean).length
  const doseName = doseLabel(TOP_DOSE)
  return {
    count,
    of: top.length,
    doseName,
    sentence: `The ${doseName} group averaged less distance than saline in ${count} of ${top.length} time bins`,
  }
}
