// Per-behavior bout statistics and the confidence profile of one recording,
// computed from the segments the API already returns (no backend data needed).
// Pure functions so the rules are unit-tested. A "bout" is one segment: an
// unbroken run of the same predicted label.
import type { BehaviorSegment } from '../api/types'
import { orderLabels } from './summary'

/** Segments below this confidence are flagged as uncertain (hatched on the ribbon). */
export const LOW_CONFIDENCE = 0.6

const length = (s: BehaviorSegment) => s.end_time - s.start_time

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export interface BoutStats {
  readonly label: string
  readonly bouts: number
  readonly seconds: number
  /** Fraction of the recording, 0-1. */
  readonly share: number
  readonly medianBout: number
  readonly longestBout: number
  /** One confidence value (0-1) per bout, in time order. */
  readonly confidences: readonly number[]
  readonly medianConfidence: number
  readonly minConfidence: number
  readonly maxConfidence: number
  /** Bouts below LOW_CONFIDENCE. */
  readonly lowBouts: number
}

/** One row per behavior present, in the canonical order (attack, investigation, mount, other, …). */
export function boutStats(segments: readonly BehaviorSegment[]): readonly BoutStats[] {
  if (segments.length === 0) return []
  const start = Math.min(...segments.map((s) => s.start_time))
  const end = Math.max(...segments.map((s) => s.end_time))
  const duration = end - start

  const byLabel = new Map<string, BehaviorSegment[]>()
  for (const s of segments) byLabel.set(s.behavior_label, [...(byLabel.get(s.behavior_label) ?? []), s])

  return orderLabels([...byLabel.keys()]).map((label) => {
    const segs = [...byLabel.get(label)!].sort((a, b) => a.start_time - b.start_time)
    const lengths = segs.map(length)
    const confidences = segs.map((s) => s.confidence)
    const seconds = lengths.reduce((a, b) => a + b, 0)
    return {
      label,
      bouts: segs.length,
      seconds,
      share: duration > 0 ? seconds / duration : 0,
      medianBout: median(lengths),
      longestBout: Math.max(...lengths),
      confidences,
      medianConfidence: median(confidences),
      minConfidence: Math.min(...confidences),
      maxConfidence: Math.max(...confidences),
      lowBouts: confidences.filter((c) => c < LOW_CONFIDENCE).length,
    }
  })
}

export interface ConfidenceProfile {
  /** Share of recording time (0-1) in segments at or above LOW_CONFIDENCE. */
  readonly highShare: number
  /** Time-weighted mean confidence, 0-1. */
  readonly mean: number
  /** The least certain segment, or null for an empty recording. */
  readonly lowest: BehaviorSegment | null
  readonly lowSegments: number
}

export function confidenceProfile(segments: readonly BehaviorSegment[]): ConfidenceProfile {
  let total = 0
  let high = 0
  let weighted = 0
  let lowest: BehaviorSegment | null = null
  let lowSegments = 0
  for (const s of segments) {
    const seconds = length(s)
    total += seconds
    weighted += s.confidence * seconds
    if (s.confidence >= LOW_CONFIDENCE) high += seconds
    else lowSegments += 1
    if (lowest === null || s.confidence < lowest.confidence) lowest = s
  }
  return {
    highShare: total > 0 ? high / total : 0,
    mean: total > 0 ? weighted / total : 0,
    lowest,
    lowSegments,
  }
}
