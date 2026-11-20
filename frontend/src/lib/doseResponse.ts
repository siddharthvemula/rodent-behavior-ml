import statsRaw from '../data/dose_response.json'
import richRaw from '../data/open_field_rich.json'
import { doseLabel, openField, type MouseMetrics, type RichMouse } from './openField'

/** Shapes of frontend/src/data/dose_response.json (pharmacology/dose_response.py). Only what the UI reads. */
export interface Comparison {
  readonly dose_mg_kg: number
  readonly mean_diff: number
  readonly mean_diff_ci: readonly [number, number]
  readonly hedges_g: number
  readonly g_ci: readonly [number, number]
  readonly p_perm: number
  readonly p_holm?: number
  readonly p_holm_all?: number
}

export interface DoseStat {
  readonly dose_mg_kg: number
  readonly n: number
  readonly mean: number
  readonly sd: number
}

export interface MetricStats {
  readonly label: string
  readonly per_dose: readonly DoseStat[]
  readonly comparisons: readonly Comparison[]
  readonly shape: string
  readonly trend?: { readonly spearman: number; readonly p: number; readonly p_holm?: number }
}

export interface TimeCourseBin {
  readonly mean: number
  readonly ci: readonly [number, number]
  readonly hedges_g_vs_saline?: number
}

export interface TimeCourse {
  readonly n_bins: number
  readonly doses: readonly { readonly dose_mg_kg: number; readonly n: number; readonly bins: readonly TimeCourseBin[] }[]
}

export interface PowerNote {
  readonly n_per_group: number
  readonly single_test: { readonly mde_d: number | null }
  readonly whole_family_bonferroni: { readonly mde_d: number | null }
}

export interface DoseResponse {
  readonly scope: string
  readonly metrics: Readonly<Record<string, MetricStats>>
  readonly power: PowerNote
  readonly phase_b: {
    readonly time_axis: {
      readonly fps_assumed: number
      readonly status: string
      readonly frames_per_bin: number
      readonly minutes_per_bin_if_assumed: number
      readonly n_bins: number
    }
    readonly primary: Readonly<Record<string, MetricStats>>
    readonly sensitivity: Readonly<Record<string, MetricStats>>
    readonly exploratory: Readonly<Record<string, MetricStats>>
    readonly time_course: TimeCourse
  }
}

export const DOSES = [0, 1, 3, 6] as const

function bad(path: string, why: string): never {
  throw new Error(`dose_response.json: ${path} ${why}`)
}

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(path, 'is not a finite number')
  return v
}

function pair(v: unknown, path: string): readonly [number, number] {
  if (!Array.isArray(v) || v.length !== 2) bad(path, 'is not a [low, high] pair')
  const [lo, hi] = [finite(v[0], `${path}[0]`), finite(v[1], `${path}[1]`)]
  if (lo > hi) bad(path, `is reversed (${lo} > ${hi})`)
  return [lo, hi]
}

function prob(v: unknown, path: string): number {
  const p = finite(v, path)
  if (p < 0 || p > 1) bad(path, `is not a probability (${p})`)
  return p
}

function checkMetric(m: unknown, path: string, opts: { adjusted: boolean }): MetricStats {
  const s = m as MetricStats
  if (!s || typeof s.label !== 'string') bad(path, 'is missing its label')
  if (!Array.isArray(s.per_dose) || s.per_dose.length !== DOSES.length) bad(path, 'needs one summary per dose group')
  s.per_dose.forEach((d, i) => {
    if (d.dose_mg_kg !== DOSES[i]) bad(`${path}.per_dose[${i}]`, `is dose ${d.dose_mg_kg}, expected ${DOSES[i]}`)
    finite(d.mean, `${path}.per_dose[${i}].mean`)
    finite(d.sd, `${path}.per_dose[${i}].sd`)
    if (!Number.isInteger(d.n) || d.n < 2) bad(`${path}.per_dose[${i}].n`, 'must be an integer >= 2')
  })
  if (!Array.isArray(s.comparisons) || s.comparisons.length !== DOSES.length - 1) bad(path, 'needs one comparison per non-saline dose')
  s.comparisons.forEach((c, i) => {
    const p = `${path}.comparisons[${i}]`
    if (c.dose_mg_kg !== DOSES[i + 1]) bad(p, `is dose ${c.dose_mg_kg}, expected ${DOSES[i + 1]}`)
    finite(c.mean_diff, `${p}.mean_diff`)
    finite(c.hedges_g, `${p}.hedges_g`)
    pair(c.g_ci, `${p}.g_ci`)
    pair(c.mean_diff_ci, `${p}.mean_diff_ci`)
    prob(c.p_perm, `${p}.p_perm`)
    if (opts.adjusted) {
      const holm = prob(c.p_holm, `${p}.p_holm`)
      const all = prob(c.p_holm_all, `${p}.p_holm_all`)
      if (holm < c.p_perm - 1e-12) bad(p, 'has an adjusted p smaller than its raw p')
      if (all < holm - 1e-12) bad(p, 'has an across-all p smaller than its within-family p')
    }
  })
  return s
}

/** Validates the committed JSON so a bad regeneration fails loudly in tests, like parseOpenField. */
export function parseDoseResponse(input: unknown): DoseResponse {
  const d = input as DoseResponse
  if (!d?.metrics || !d.phase_b?.primary || !d.phase_b.time_course || !d.power) bad('', 'is malformed (missing sections)')
  if (typeof d.scope !== 'string' || !d.scope) bad('scope', 'is missing')
  for (const key of PRIMARY_ORDER) {
    const source = key in d.metrics ? d.metrics : d.phase_b.primary
    if (!(key in source)) bad(key, 'is missing from the primary metrics')
    checkMetric(source[key], key, { adjusted: true })
  }
  for (const group of ['sensitivity', 'exploratory'] as const) {
    for (const [k, m] of Object.entries(d.phase_b[group])) checkMetric(m, `${group}.${k}`, { adjusted: false })
  }
  const tc = d.phase_b.time_course
  if (tc.doses.length !== DOSES.length) bad('time_course', 'needs one series per dose')
  tc.doses.forEach((s, i) => {
    if (s.dose_mg_kg !== DOSES[i]) bad(`time_course.doses[${i}]`, `is dose ${s.dose_mg_kg}, expected ${DOSES[i]}`)
    if (s.bins.length !== tc.n_bins) bad(`time_course.doses[${i}]`, `has ${s.bins.length} bins, expected ${tc.n_bins}`)
    s.bins.forEach((b, j) => {
      finite(b.mean, `time_course.doses[${i}].bins[${j}].mean`)
      pair(b.ci, `time_course.doses[${i}].bins[${j}].ci`)
    })
  })
  const ta = d.phase_b.time_axis
  finite(ta.fps_assumed, 'time_axis.fps_assumed')
  finite(ta.minutes_per_bin_if_assumed, 'time_axis.minutes_per_bin_if_assumed')
  if (!/inferred/i.test(ta.status)) bad('time_axis.status', 'must say the frame rate is inferred')
  return d
}

/** The four primary metrics, in reading order: locomotion first, then where the mice go. */
export const PRIMARY_ORDER = ['distance_arena_widths', 'immobility_pct', 'center_pct', 'center_pct_moving'] as const
export type PrimaryKey = (typeof PRIMARY_ORDER)[number]

export interface PrimarySpec {
  readonly key: PrimaryKey
  readonly title: string
  /** Unit of the raw difference shown in tooltips and the table. */
  readonly unit: string
  /** Wording for a positive / negative effect in the plain-language summary. */
  readonly up: string
  readonly down: string
}

export const PRIMARY_SPECS: readonly PrimarySpec[] = [
  { key: 'distance_arena_widths', title: 'Distance traveled', unit: 'arena widths', up: 'farther', down: 'shorter' },
  { key: 'immobility_pct', title: 'Time immobile', unit: 'percentage points', up: 'more', down: 'less' },
  { key: 'center_pct', title: 'Time in center (all frames)', unit: 'percentage points', up: 'more', down: 'less' },
  { key: 'center_pct_moving', title: 'Time in center (moving frames only)', unit: 'percentage points', up: 'more', down: 'less' },
]

export const doseResponse: DoseResponse = parseDoseResponse(statsRaw)

export function primaryMetric(dr: DoseResponse, key: PrimaryKey): MetricStats {
  const m = dr.metrics[key] ?? dr.phase_b.primary[key]
  if (!m) throw new Error(`dose_response.json: no primary metric ${key}`)
  return m
}

/** Holm-adjusted p below this counts as significant. Fixed in the analysis design, not tunable in the UI. */
export const ALPHA = 0.05

export function isSignificant(c: Comparison): boolean {
  return (c.p_holm ?? 1) < ALPHA
}

export function formatP(p: number): string {
  if (p < 0.001) return '< 0.001'
  return p < 0.01 ? p.toFixed(3) : p.toFixed(2)
}

export function formatSigned(v: number, digits = 2): string {
  const s = Math.abs(v).toFixed(digits)
  return v < 0 ? `−${s}` : `+${s}`
}

function joinDoses(doses: readonly number[]): string {
  const names = doses.map((d) => doseLabel(d))
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** One plain sentence per metric, built from the numbers so the prose cannot drift from the statistics. */
export function summarizeComparisons(m: MetricStats, spec: Pick<PrimarySpec, 'up' | 'down'>): string {
  const sig = m.comparisons.filter(isSignificant)
  const quiet = m.comparisons.filter((c) => !isSignificant(c))
  const parts: string[] = []
  for (const [word, group] of [
    [spec.up, sig.filter((c) => c.hedges_g > 0)],
    [spec.down, sig.filter((c) => c.hedges_g < 0)],
  ] as const) {
    if (!group.length) continue
    const ps = group.map((c) => formatP(c.p_holm ?? 1)).map((p) => (p.startsWith('<') ? `p ${p}` : `p = ${p}`))
    parts.push(`${word} than saline at ${joinDoses(group.map((c) => c.dose_mg_kg))} (Holm ${ps.join(' and ')})`)
  }
  const head = parts.length ? parts.join('; ') : 'No dose clearly different from saline'
  const tail = quiet.length && parts.length ? `; not distinguishable from saline at ${joinDoses(quiet.map((c) => c.dose_mg_kg))}` : ''
  return `${head[0].toUpperCase()}${head.slice(1)}${tail}.`
}

/** The merged per-mouse table: open_field.json (whole-session metrics) + open_field_rich.json (phase B). */
export function mergeRich(base: readonly MouseMetrics[], rich: unknown): RichMouse[] {
  const r = (rich as { mice?: { id: string; dose_mg_kg: number; immobility_pct: number; center_pct_moving: number }[] })?.mice
  if (!Array.isArray(r) || r.length !== base.length) throw new Error('open_field_rich.json does not list the same mice as open_field.json')
  return base.map((m, i) => {
    const x = r[i]
    if (x.id !== m.id || x.dose_mg_kg !== m.dose_mg_kg) throw new Error(`open_field_rich.json: mouse ${i} is ${x.id}, expected ${m.id}`)
    for (const k of ['immobility_pct', 'center_pct_moving'] as const) {
      if (!Number.isFinite(x[k])) throw new Error(`open_field_rich.json: bad ${k} for ${m.id}`)
    }
    return { ...m, immobility_pct: x.immobility_pct, center_pct_moving: x.center_pct_moving }
  })
}

export const richMice: readonly RichMouse[] = mergeRich(openField.mice, richRaw)

export interface ForestRow {
  readonly dose: number
  readonly g: number
  readonly ci: readonly [number, number]
  readonly diff: number
  readonly diffCi: readonly [number, number]
  readonly pRaw: number
  readonly pHolm: number
  readonly pAll: number
  readonly significant: boolean
}

export function forestRows(m: MetricStats): ForestRow[] {
  return m.comparisons.map((c) => ({
    dose: c.dose_mg_kg,
    g: c.hedges_g,
    ci: c.g_ci,
    diff: c.mean_diff,
    diffCi: c.mean_diff_ci,
    pRaw: c.p_perm,
    pHolm: c.p_holm ?? 1,
    pAll: c.p_holm_all ?? 1,
    significant: isSignificant(c),
  }))
}

/** Shared effect-size axis for every forest plot, so effect sizes compare across metrics. */
export function effectAxis(dr: DoseResponse): { readonly lim: number; readonly ticks: readonly number[] } {
  const bound = Math.max(...PRIMARY_ORDER.flatMap((k) => primaryMetric(dr, k).comparisons.flatMap((c) => [Math.abs(c.g_ci[0]), Math.abs(c.g_ci[1])])))
  const lim = Math.max(2, Math.ceil(bound / 2) * 2)
  const step = lim > 8 ? 5 : 2
  const top = Math.ceil(lim / step) * step
  const ticks: number[] = []
  for (let t = -top; t <= top; t += step) ticks.push(t)
  return { lim: top, ticks }
}
