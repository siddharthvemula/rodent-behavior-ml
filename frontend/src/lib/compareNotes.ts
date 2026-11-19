import type { RecordingDurations } from '../api/types'
import { formatDuration } from './summary'

/** Below this a recording is too short for stable percentages (matches the backend's warning). */
export const SHORT_RECORDING_SECONDS = 10
/** Longer-to-shorter ratio above which the comparison is no longer like-for-like. */
export const LENGTH_RATIO_CAUTION = 3

export interface DurationNote {
  /** "Recording A: 12 s · Recording B: 3 min 20 s" */
  readonly line: string
  /** A non-blocking caution, or null when the two recordings are comparable in length. */
  readonly caution: string | null
}

/**
 * Behavior percentages are per recording, so differently long recordings can
 * still be compared, but short clips are noisy and very unequal lengths are
 * not like-for-like. We say so; we never trim or block.
 */
export function describeDurations(d: RecordingDurations | null): DurationNote | null {
  if (!d || d.control <= 0 || d.treated <= 0) return null
  const line = `Recording A: ${formatDuration(d.control)} · Recording B: ${formatDuration(d.treated)}`
  const shortest = Math.min(d.control, d.treated)
  const ratio = Math.max(d.control, d.treated) / shortest

  const reasons: string[] = []
  if (shortest < SHORT_RECORDING_SECONDS) {
    reasons.push(`one recording is under ${SHORT_RECORDING_SECONDS} s, so its percentages are noisy`)
  }
  if (ratio > LENGTH_RATIO_CAUTION) {
    reasons.push(`one is ${Math.round(ratio)}× longer than the other, so this is not a like-for-like comparison`)
  }
  return { line, caution: reasons.length ? `Heads up: ${reasons.join(', and ')}.` : null }
}
