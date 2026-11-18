import raw from '../data/open_field.json'

/** One mouse's open-field metrics, computed by pharmacology/open_field.py. */
export interface MouseMetrics {
  readonly id: string
  readonly dose_mg_kg: number
  readonly distance_px: number
  readonly center_pct: number
  readonly mean_speed_px_per_frame: number
}

export interface OpenFieldData {
  readonly dataset: { readonly name: string; readonly url: string; readonly license: string; readonly citation: string }
  readonly parameters: { readonly center_definition: string; readonly max_step_px: number; readonly min_likelihood: number }
  readonly mice: readonly MouseMetrics[]
}

export type MetricKey = 'distance_px' | 'center_pct' | 'mean_speed_px_per_frame'

export interface MetricSpec {
  readonly key: MetricKey
  readonly title: string
  readonly unit: string
  readonly format: (v: number) => string
  /** Fixed axis max, when the metric has a natural one. */
  readonly fixedMax?: number
}

export const METRICS: readonly MetricSpec[] = [
  {
    key: 'distance_px',
    title: 'Total distance traveled',
    unit: 'pixels',
    format: (v) => `${Math.round(v).toLocaleString('en-US')} px`,
  },
  {
    key: 'center_pct',
    title: 'Time in center',
    unit: '% of recording',
    format: (v) => `${v.toFixed(1)}%`,
    fixedMax: 100,
  },
  {
    key: 'mean_speed_px_per_frame',
    title: 'Average speed',
    unit: 'pixels per frame',
    format: (v) => `${v.toFixed(2)} px/frame`,
  },
]

export interface DoseGroup {
  readonly dose: number
  readonly label: string
  readonly mice: readonly MouseMetrics[]
}

export function doseLabel(dose: number): string {
  return dose === 0 ? 'Saline' : `${dose} mg/kg`
}

export function groupByDose(mice: readonly MouseMetrics[]): DoseGroup[] {
  const doses = [...new Set(mice.map((m) => m.dose_mg_kg))].sort((a, b) => a - b)
  return doses.map((dose) => ({
    dose,
    label: doseLabel(dose),
    mice: mice.filter((m) => m.dose_mg_kg === dose),
  }))
}

export function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Round the axis max up to 1, 2 or 5 x 10^n so ticks land on clean numbers. */
export function niceMax(value: number): number {
  if (value <= 0) return 1
  const exp = Math.floor(Math.log10(value))
  const base = 10 ** exp
  for (const m of [1, 2, 5, 10]) if (value <= m * base) return m * base
  return 10 * base
}

/** Deterministic horizontal offset in [-1, 1] so repeated renders place dots identically. */
export function jitter(index: number, count: number): number {
  if (count <= 1) return 0
  // Spread evenly, then interleave so neighbours in value order do not sit side by side.
  const slot = (index * 3) % count
  return (slot / (count - 1)) * 2 - 1
}

/** Validates the committed JSON once so a bad regeneration fails loudly in tests. */
export function parseOpenField(input: unknown): OpenFieldData {
  const d = input as OpenFieldData
  if (!d?.mice?.length || !d.dataset?.citation) throw new Error('open_field.json is malformed')
  for (const m of d.mice) {
    for (const k of ['dose_mg_kg', 'distance_px', 'center_pct', 'mean_speed_px_per_frame'] as const) {
      if (!Number.isFinite(m[k])) throw new Error(`open_field.json: bad ${k} for ${m.id}`)
    }
  }
  return d
}

export const openField: OpenFieldData = parseOpenField(raw)
