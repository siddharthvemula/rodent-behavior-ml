import type { BehaviorSegment, CompareIntervals, CompareResult, Interval } from '../api/types'

/**
 * Precomputed data for the guided demo (ml/export_demo_clips.py): the model's real predictions and the dataset's
 * annotations for two 100 s clips of CalMS21 TEST-split recordings, plus the A-vs-B comparison. The clips are
 * always called "Clip A" and "Clip B".
 *
 * The annotations are CalMS21's own labels (CC BY 4.0, Sun et al. 2021), committed for these two clips only, so
 * anything that shows them must show `attribution` too.
 */
export interface AnnotatedSegment {
  readonly start_time: number
  readonly end_time: number
  readonly behavior_label: string
}

export interface ClipAgreement {
  readonly frames: number
  readonly accuracy: number
  /** null when the behavior never occurs in the annotation (no F1 exists, which is not the same as 0). */
  readonly per_class_f1: Readonly<Record<string, number | null>>
  readonly macro_f1_present_classes: number
  readonly confusion_rows_annotated_cols_predicted: readonly (readonly number[])[]
  readonly time_share_annotated: Readonly<Record<string, number>>
  readonly time_share_predicted: Readonly<Record<string, number>>
}

export interface DemoClip {
  readonly id: 'clip_a' | 'clip_b'
  readonly label: 'Clip A' | 'Clip B'
  readonly source: {
    readonly split: 'test'
    readonly recording: string
    readonly start_frame: number
    readonly frames: number
    readonly seconds: number
    readonly frame_rate: number
  }
  readonly annotations: readonly AnnotatedSegment[]
  readonly predictions: readonly BehaviorSegment[]
  readonly agreement: ClipAgreement
}

type Freq = Readonly<Record<string, number>>
type Ivals = Readonly<Record<string, Interval>>

export interface DemoClips {
  readonly attribution: {
    readonly dataset: string
    readonly citation: string
    readonly url: string
    readonly license: string
    readonly license_url: string
    readonly changes: string
  }
  readonly model: { readonly sha256: string; readonly n_features: number; readonly smoothing_window: number; readonly sklearn_version: string }
  readonly behaviors: readonly string[]
  readonly clips: readonly [DemoClip, DemoClip]
  /** b minus a, under neutral keys. */
  readonly compare: { readonly a: Freq; readonly b: Freq; readonly difference: Freq }
  readonly compare_intervals: { readonly level: number; readonly a: Ivals; readonly b: Ivals; readonly difference: Ivals }
}

/** Words that imply an experiment. The demo clips are two arbitrary recordings, so none of them may appear in this data. */
const FORBIDDEN = /control|treat/i

function bad(path: string, why: string): never {
  throw new Error(`demo_clips.json: ${path} ${why}`)
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(path, 'is not a finite number')
  return v
}

function checkTiling(segs: readonly { start_time: number; end_time: number; behavior_label: string }[], seconds: number, tol: number, behaviors: readonly string[], path: string): void {
  if (!segs.length) bad(path, 'is empty')
  if (segs[0].start_time !== 0) bad(path, 'does not start at 0')
  if (Math.abs(segs[segs.length - 1].end_time - seconds) > tol) bad(path, `does not end at ${seconds} s`)
  segs.forEach((s, i) => {
    num(s.start_time, `${path}[${i}].start_time`)
    if (!behaviors.includes(s.behavior_label)) bad(`${path}[${i}]`, `has unknown behavior ${String(s.behavior_label)}`)
    if (!(s.end_time > s.start_time)) bad(`${path}[${i}]`, 'ends before it starts')
    if (i > 0 && Math.abs(s.start_time - segs[i - 1].end_time) > tol) bad(`${path}[${i}]`, 'leaves a gap or overlap')
  })
}

/** Validates the committed JSON so a bad regeneration fails loudly in tests, like parseOpenField. */
export function parseDemoClips(input: unknown): DemoClips {
  if (FORBIDDEN.test(JSON.stringify(input))) bad('', 'contains a two-group label; the demo clips are Clip A and Clip B')
  const d = input as DemoClips
  if (!d?.clips || d.clips.length !== 2 || !d.compare || !d.compare_intervals || !d.attribution) bad('', 'is malformed (missing sections)')
  const a = d.attribution
  if (a.license !== 'CC BY 4.0' || !a.license_url || !a.url || !a.citation || !a.changes) bad('attribution', 'is incomplete (CC BY needs license, source and a statement of changes)')
  const labels = d.clips.map((c) => `${c.id}/${c.label}`)
  if (labels[0] !== 'clip_a/Clip A' || labels[1] !== 'clip_b/Clip B') bad('clips', `must be Clip A then Clip B, got ${labels.join(', ')}`)
  for (const c of d.clips) {
    const p = c.label
    if (c.source.split !== 'test') bad(`${p}.source`, `is from the ${c.source.split} split, not test`)
    const seconds = num(c.source.seconds, `${p}.source.seconds`)
    checkTiling(c.annotations, seconds, 0.002, d.behaviors, `${p}.annotations`)
    checkTiling(c.predictions, seconds, 0.011, d.behaviors, `${p}.predictions`)
    for (const [i, s] of c.predictions.entries()) {
      if (num(s.confidence, `${p}.predictions[${i}].confidence`) < 0 || s.confidence > 1) bad(`${p}.predictions[${i}]`, 'has a confidence outside 0..1')
    }
    const cm = c.agreement.confusion_rows_annotated_cols_predicted
    const total = cm.flat().reduce((x, y) => x + y, 0)
    if (cm.length !== d.behaviors.length || total !== c.agreement.frames || total !== c.source.frames) bad(`${p}.agreement`, 'confusion matrix does not add up to the clip length')
    const diag = cm.reduce((s, row, i) => s + row[i], 0)
    if (Math.abs(diag / total - c.agreement.accuracy) > 1e-3) bad(`${p}.agreement`, 'accuracy does not match its confusion matrix')
  }
  for (const k of d.behaviors) {
    num(d.compare.a[k], `compare.a.${k}`)
    num(d.compare.b[k], `compare.b.${k}`)
    if (Math.abs(d.compare.difference[k] - (d.compare.b[k] - d.compare.a[k])) > 0.011) bad(`compare.difference.${k}`, 'is not b minus a')
    for (const who of ['a', 'b', 'difference'] as const) {
      const [lo, hi] = d.compare_intervals[who][k] ?? bad(`compare_intervals.${who}.${k}`, 'is missing')
      if (!(lo <= hi)) bad(`compare_intervals.${who}.${k}`, 'is reversed')
    }
  }
  return d
}

/** The A-vs-B comparison in the shape the existing Compare components take (their internal field names are a fixed API contract). */
export function demoCompareResult(d: DemoClips): CompareResult {
  return { control: d.compare.a, treated: d.compare.b, difference: d.compare.difference }
}

export function demoCompareIntervals(d: DemoClips): CompareIntervals {
  const i = d.compare_intervals
  return { level: i.level, control: i.a, treated: i.b, difference: i.difference }
}

export function clipById(d: DemoClips, id: DemoClip['id']): DemoClip {
  const c = d.clips.find((x) => x.id === id)
  if (!c) throw new Error(`demo_clips.json: no clip ${id}`)
  return c
}

export interface Span {
  readonly start: number
  readonly end: number
}

/** Shorter than this is rounding between the two files' time resolutions (0.001 s vs 0.01 s), not a disagreement. */
const MIN_SPAN_SECONDS = 0.02

function labelAt(segs: readonly { start_time: number; end_time: number; behavior_label: string }[], t: number): string | null {
  for (const s of segs) if (t >= s.start_time && t < s.end_time) return s.behavior_label
  return null
}

/** Stretches of the clip where the model's label differs from the human annotation, merged and in time order. */
export function disagreementSpans(clip: Pick<DemoClip, 'annotations' | 'predictions'>): Span[] {
  const cuts = [...new Set([...clip.annotations, ...clip.predictions].flatMap((s) => [s.start_time, s.end_time]))].sort((a, b) => a - b)
  const out: Span[] = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]]
    if (b - a < 1e-9) continue
    const mid = (a + b) / 2
    const [x, y] = [labelAt(clip.annotations, mid), labelAt(clip.predictions, mid)]
    if (x === null || y === null || x === y) continue
    const last = out[out.length - 1]
    if (last && Math.abs(last.end - a) < 1e-9) out[out.length - 1] = { start: last.start, end: b }
    else out.push({ start: a, end: b })
  }
  return out.filter((s) => s.end - s.start >= MIN_SPAN_SECONDS)
}
