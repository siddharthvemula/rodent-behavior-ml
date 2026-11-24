import statsRaw from '../data/group_comparison.json'
import { formatP, formatSigned } from './doseResponse'

export { formatP, formatSigned }

/** Shapes of frontend/src/data/group_comparison.json (behavior_groups/group_comparison.py). Only what the UI reads. */
export type GroupId = 'naive' | 'stress' | 'isolation' | 'mated'
export const GROUPS: readonly GroupId[] = ['naive', 'stress', 'isolation', 'mated']
export const REFERENCE: GroupId = 'naive'
export const CONTRASTS: readonly GroupId[] = GROUPS.slice(1)

export const GROUP_LABEL: Readonly<Record<GroupId, string>> = {
  naive: 'Naive',
  stress: 'Stress',
  isolation: 'Social isolation',
  mated: 'Mated',
}

export interface GroupSummary {
  readonly n: number
  readonly mean: number
  readonly sd: number
  readonly median: number
  readonly n_zero: number
  readonly values: readonly number[]
}

export interface Comparison {
  readonly group: GroupId
  readonly mean_diff: number
  readonly mean_diff_ci: readonly [number, number]
  readonly hedges_g: number
  readonly g_ci: readonly [number, number]
  readonly p_perm: number
  readonly p_method: string
  readonly p_holm?: number
}

export interface MetricStats {
  readonly label: string
  readonly behavior: string
  readonly kind: string
  readonly groups: Readonly<Record<GroupId, GroupSummary>>
  readonly comparisons: readonly Comparison[]
}

export interface BetweenComparison {
  readonly a: GroupId
  readonly b: GroupId
  readonly hedges_g: number
  readonly g_ci: readonly [number, number]
  readonly p_perm: number
  readonly p_method: string
}

export interface GroupComparison {
  readonly scope: string
  readonly dataset: {
    readonly name: string
    readonly url: string
    readonly doi: string
    readonly license: string
    readonly citation: string
    readonly contributing_lab: string
  }
  readonly design: {
    readonly groups: Readonly<Record<GroupId, number>>
    readonly behaviors: readonly string[]
    readonly alpha: number
    readonly family: string
  }
  readonly window_minutes_range: readonly [number, number]
  readonly metrics: Readonly<Record<string, MetricStats>>
  readonly between_groups_exploratory: {
    readonly pairs: readonly (readonly [GroupId, GroupId])[]
    readonly metrics: Readonly<Record<string, readonly BetweenComparison[]>>
  }
  readonly time_shift: {
    readonly videos_shifted_by_group: Readonly<Record<GroupId, number>>
    readonly videos_by_group: Readonly<Record<GroupId, number>>
    readonly unshifted_by_group: Readonly<Record<GroupId, number>>
    readonly offsets_frames: readonly number[]
    readonly sensitivity_without_shifted: unknown
  }
  readonly power: {
    readonly n_per_group: number
    readonly single_test: { readonly mde_d: number | null }
    readonly whole_family_bonferroni: { readonly mde_d: number | null }
  }
}

/** The six behaviors scored in every recording of every group, in reading order, with plain-language meaning. */
export const BEHAVIOR_SPECS = [
  { key: 'attack', title: 'Attack', gloss: 'resident attacks the intruder' },
  { key: 'dominancegroom', title: 'Dominance grooming', gloss: 'resident grooms the intruder in a dominance-related way' },
  { key: 'sniff', title: 'Sniff', gloss: 'resident sniffs the intruder (not the genital area)' },
  { key: 'sniffgenital', title: 'Genital sniff', gloss: 'resident sniffs the intruder’s genital area' },
  { key: 'dig', title: 'Dig', gloss: 'resident digs' },
  { key: 'selfgroom', title: 'Self-grooming', gloss: 'resident grooms itself' },
] as const
export const KINDS = [
  { key: 'time_pct', title: 'Time in behavior', unit: 'percentage points of the session', short: '% of session' },
  { key: 'bouts_per_min', title: 'Bout frequency', unit: 'bouts per minute', short: 'bouts / min' },
] as const
export type KindKey = (typeof KINDS)[number]['key']

export const metricKey = (behavior: string, kind: KindKey) => `${behavior}_${kind}`

function bad(path: string, why: string): never {
  throw new Error(`group_comparison.json: ${path} ${why}`)
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

/** Validates the committed JSON so a bad regeneration fails loudly in tests, like parseDoseResponse. */
export function parseGroupComparison(input: unknown): GroupComparison {
  const d = input as GroupComparison
  if (!d?.metrics || !d.design?.groups || !d.power || !d.time_shift || !d.between_groups_exploratory)
    bad('', 'is malformed (missing sections)')
  if (typeof d.scope !== 'string' || !d.scope) bad('scope', 'is missing')
  if (!d.dataset?.url || !d.dataset.license || !d.dataset.citation) bad('dataset', 'is missing its url, license or citation')
  if (JSON.stringify(d.design.behaviors) !== JSON.stringify(BEHAVIOR_SPECS.map((b) => b.key)))
    bad('design.behaviors', 'differs from the behaviors the page describes')
  pair(d.window_minutes_range, 'window_minutes_range')
  for (const g of GROUPS) {
    if (!Number.isInteger(d.design.groups[g]) || d.design.groups[g] < 2) bad(`design.groups.${g}`, 'must be an integer >= 2')
  }
  const keys = BEHAVIOR_SPECS.flatMap((b) => KINDS.map((k) => metricKey(b.key, k.key)))
  if (Object.keys(d.metrics).length !== keys.length) bad('metrics', `has ${Object.keys(d.metrics).length} metrics, expected ${keys.length}`)
  let family = 0
  for (const key of keys) {
    const m = d.metrics[key]
    if (!m || typeof m.label !== 'string') bad(key, 'is missing')
    for (const g of GROUPS) {
      const s = m.groups?.[g]
      if (!s) bad(`${key}.groups.${g}`, 'is missing')
      finite(s.mean, `${key}.groups.${g}.mean`)
      finite(s.sd, `${key}.groups.${g}.sd`)
      finite(s.median, `${key}.groups.${g}.median`)
      if (s.values.length !== d.design.groups[g] || s.n !== s.values.length)
        bad(`${key}.groups.${g}`, 'has a different number of recordings than the design')
      s.values.forEach((v, i) => finite(v, `${key}.groups.${g}.values[${i}]`))
      if (!Number.isInteger(s.n_zero) || s.n_zero < 0 || s.n_zero > s.n) bad(`${key}.groups.${g}.n_zero`, 'is out of range')
    }
    if (m.comparisons.length !== CONTRASTS.length) bad(key, 'needs one comparison per non-naive group')
    m.comparisons.forEach((c, i) => {
      const p = `${key}.comparisons[${i}]`
      if (c.group !== CONTRASTS[i]) bad(p, `is ${c.group}, expected ${CONTRASTS[i]}`)
      finite(c.mean_diff, `${p}.mean_diff`)
      finite(c.hedges_g, `${p}.hedges_g`)
      pair(c.g_ci, `${p}.g_ci`)
      pair(c.mean_diff_ci, `${p}.mean_diff_ci`)
      prob(c.p_perm, `${p}.p_perm`)
      if (c.p_method !== 'exact') bad(p, 'was not an exact permutation test')
      const holm = prob(c.p_holm, `${p}.p_holm`)
      if (holm < c.p_perm - 1e-12) bad(p, 'has an adjusted p smaller than its raw p')
      family += 1
    })
  }
  for (const [key, rows] of Object.entries(d.between_groups_exploratory.metrics)) {
    rows.forEach((r, i) => {
      finite(r.hedges_g, `between.${key}[${i}].hedges_g`)
      pair(r.g_ci, `between.${key}[${i}].g_ci`)
      prob(r.p_perm, `between.${key}[${i}].p_perm`)
    })
  }
  if (!/\b36\b/.test(d.design.family) || family !== 36) bad('design.family', `lists ${family} comparisons, expected the 36 planned`)
  if (!Number.isInteger(d.power.n_per_group) || d.power.n_per_group !== d.design.groups[REFERENCE])
    bad('power.n_per_group', 'does not match the naive group size')
  return d
}

export const groupComparison: GroupComparison = parseGroupComparison(statsRaw)

export const FAMILY_SIZE = BEHAVIOR_SPECS.length * KINDS.length * CONTRASTS.length

/** Holm-adjusted p below the design's alpha counts as significant. Fixed in the analysis, not tunable in the UI. */
export const isSignificant = (c: Comparison, alpha = groupComparison.design.alpha) => (c.p_holm ?? 1) < alpha

export function allComparisons(data: GroupComparison): { metric: MetricStats; comparison: Comparison }[] {
  return Object.values(data.metrics).flatMap((metric) => metric.comparisons.map((comparison) => ({ metric, comparison })))
}

export interface FamilyOutcome {
  readonly total: number
  readonly significant: number
  readonly rawBelowAlpha: number
  /** Raw-p < alpha hits expected by chance alone if every null were true. */
  readonly expectedByChance: number
  readonly smallestHolm: number
}

export function familyOutcome(data: GroupComparison): FamilyOutcome {
  const all = allComparisons(data)
  const alpha = data.design.alpha
  return {
    total: all.length,
    significant: all.filter((x) => isSignificant(x.comparison, alpha)).length,
    rawBelowAlpha: all.filter((x) => x.comparison.p_perm < alpha).length,
    expectedByChance: all.length * alpha,
    smallestHolm: Math.min(...all.map((x) => x.comparison.p_holm ?? 1)),
  }
}

export interface ForestRow {
  readonly behavior: string
  readonly group: GroupId
  readonly g: number
  readonly ci: readonly [number, number]
  readonly diff: number
  readonly diffCi: readonly [number, number]
  readonly pRaw: number
  readonly pHolm: number
  readonly significant: boolean
}

export function forestRows(data: GroupComparison, kind: KindKey): ForestRow[] {
  return BEHAVIOR_SPECS.flatMap((b) =>
    data.metrics[metricKey(b.key, kind)].comparisons.map((c) => ({
      behavior: b.key,
      group: c.group,
      g: c.hedges_g,
      ci: c.g_ci,
      diff: c.mean_diff,
      diffCi: c.mean_diff_ci,
      pRaw: c.p_perm,
      pHolm: c.p_holm ?? 1,
      significant: isSignificant(c, data.design.alpha),
    })),
  )
}

/** One effect-size axis for both forest plots, so sizes compare across metrics. */
export function effectAxis(data: GroupComparison): { readonly lim: number; readonly ticks: readonly number[] } {
  const bound = Math.max(...allComparisons(data).flatMap((x) => [Math.abs(x.comparison.g_ci[0]), Math.abs(x.comparison.g_ci[1])]))
  const step = bound > 8 ? 5 : 2
  const top = Math.max(step, Math.ceil(bound / step) * step)
  const ticks: number[] = []
  for (let t = -top; t <= top; t += step) ticks.push(t)
  return { lim: top, ticks }
}

export const pText = (p: number) => (formatP(p).startsWith('<') ? `p ${formatP(p)}` : `p = ${formatP(p)}`)

/** One sentence per behavior, built from the numbers so the prose cannot drift from the statistics. */
export function summarizeBehavior(data: GroupComparison, behavior: string): string {
  const parts: string[] = []
  for (const kind of KINDS) {
    const m = data.metrics[metricKey(behavior, kind.key)]
    const eff = m.comparisons.map((c) => `${GROUP_LABEL[c.group].toLowerCase()} ${formatSigned(c.hedges_g, 2)}`).join(', ')
    parts.push(`${kind.title.toLowerCase()}, effect size vs naive: ${eff}`)
  }
  const sig = KINDS.flatMap((k) => data.metrics[metricKey(behavior, k.key)].comparisons.filter((c) => isSignificant(c, data.design.alpha)))
  return `${parts.join('; ')}. ${sig.length ? `${sig.length} remain significant after correction.` : 'None significant after correction.'}`
}

/** Share of recordings with no bout of this behavior, per group (a zero-heavy metric makes mean-based tests weak). */
export function zeroShare(data: GroupComparison, behavior: string): Record<GroupId, number> {
  const m = data.metrics[metricKey(behavior, 'time_pct')]
  return Object.fromEntries(GROUPS.map((g) => [g, m.groups[g].n_zero / m.groups[g].n])) as Record<GroupId, number>
}
