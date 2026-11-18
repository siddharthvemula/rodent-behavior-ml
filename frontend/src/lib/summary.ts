// Plain-language findings, generated from the actual result: nothing here is
// hardcoded to a particular dataset. Pure functions (no React) so the wording
// rules are unit-tested.
import type { BehaviorSegment, CompareResult } from '../api/types'
import { behaviorInfo, capitalize } from './behaviorInfo'
import { buildCompareRows, KNOWN_BEHAVIORS, summarizeTimeline, type CompareRow } from './behaviors'

/** Differences smaller than this (5 percentage points of time) are not called a change. */
export const MEANINGFUL_DIFFERENCE = 0.05
const LARGE_DIFFERENCE = 0.25
const MODERATE_DIFFERENCE = 0.1

const SOCIAL_BEHAVIOR_NOTE = 'other'

// Differences are computed from decimal fractions (0.15 - 0.10 is
// 0.04999999999999999 in floating point), so thresholds are compared with a
// small tolerance to make "exactly 5 points" mean 5 points.
const EPSILON = 1e-9
const atLeast = (value: number, threshold: number) => value + EPSILON >= threshold

export const percent = (fraction: number) => `${Math.round(fraction * 100)}%`

/** "1 min 40 s", "45 s": spoken-style duration for headlines. */
export function formatDuration(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds)
  if (rounded < 60) return `${rounded} s`
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`
}

// ---- control vs treated ----

export interface ComparisonLead {
  readonly label: string
  readonly control: number
  readonly treated: number
  readonly difference: number
  /** "jumped", "rose", "fell sharply"… */
  readonly verb: string
}

export interface ComparisonSummary {
  readonly kind: 'changed' | 'similar' | 'empty'
  /** The full headline as one sentence (also the accessible name). */
  readonly headline: string
  /** One supporting sentence under the headline. */
  readonly context: string
  /** "Also: investigating fell from 61% to 12%." (empty when there is nothing else) */
  readonly alsoNoted: string
  /** The behavior the headline is about, for rich rendering. */
  readonly lead: ComparisonLead | null
}

function changeVerb(difference: number): string {
  const size = Math.abs(difference)
  if (difference > 0) {
    return atLeast(size, LARGE_DIFFERENCE) ? 'jumped' : atLeast(size, MODERATE_DIFFERENCE) ? 'rose' : 'rose slightly'
  }
  return atLeast(size, LARGE_DIFFERENCE) ? 'fell sharply' : atLeast(size, MODERATE_DIFFERENCE) ? 'fell' : 'fell slightly'
}

function describeRow(row: CompareRow): string {
  return `${behaviorInfo(row.label).gerund} ${changeVerb(row.difference)} from ${percent(row.control)} to ${percent(row.treated)}`
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * Finds the headline change. `other` is the catch-all background class, so it
 * is never the headline when a named behavior is available. The numbers are
 * fractions of recording time (ARCHITECTURE.md: per-behavior frequency).
 */
export function summarizeComparison(result: CompareResult): ComparisonSummary {
  const rows = buildCompareRows(result)
  if (rows.length === 0) {
    return { kind: 'empty', headline: 'No behaviors were detected', context: '', alsoNoted: '', lead: null }
  }

  const named = rows.filter((r) => r.label !== SOCIAL_BEHAVIOR_NOTE)
  const candidates = named.length > 0 ? named : rows
  const changed = candidates.filter((r) => atLeast(Math.abs(r.difference), MEANINGFUL_DIFFERENCE))

  if (changed.length === 0) {
    return {
      kind: 'similar',
      headline: 'Behavior looks about the same in both recordings',
      context: `No behavior differs by more than ${Math.round(MEANINGFUL_DIFFERENCE * 100)} percentage points between control and treated.`,
      alsoNoted: '',
      lead: null,
    }
  }

  const top = changed[0] // buildCompareRows sorts by |difference|, largest first
  const lead: ComparisonLead = { ...top, verb: changeVerb(top.difference) }
  const alsoNoted =
    changed.length > 1 ? `Also: ${joinList(changed.slice(1).map(describeRow))}.` : ''

  return {
    kind: 'changed',
    headline: `${capitalize(describeRow(top))} of the time`,
    context: 'This is the biggest difference between the control and treated recordings.',
    alsoNoted,
    lead,
  }
}

// ---- one recording ----

export interface RecordingSummary {
  readonly headline: string
  readonly context: string
  /** The behavior the headline is about (drives the icon/color). */
  readonly leadLabel: string
  readonly duration: number
  readonly segmentCount: number
  /** Time-weighted mean confidence, 0-1. */
  readonly meanConfidence: number
  readonly longest: { readonly label: string; readonly start: number; readonly end: number; readonly seconds: number }
}

export function summarizeRecording(segments: readonly BehaviorSegment[]): RecordingSummary | null {
  if (segments.length === 0) return null
  const { duration, totals } = summarizeTimeline(segments)
  const top = totals[0]
  const topInfo = behaviorInfo(top.label)

  const weighted = segments.reduce(
    (acc, s) => ({ sum: acc.sum + s.confidence * (s.end_time - s.start_time), time: acc.time + (s.end_time - s.start_time) }),
    { sum: 0, time: 0 },
  )
  const longestSeg = segments.reduce((best, s) => (s.end_time - s.start_time > best.end_time - best.start_time ? s : best))

  const headline =
    top.share >= 0.5
      ? `Mostly ${topInfo.gerund}: ${percent(top.share)} of this ${formatDuration(duration)} recording`
      : `No single behavior dominated this ${formatDuration(duration)} recording; ${topInfo.gerund} led at ${percent(top.share)}`

  const social = totals.filter((t) => t.label !== SOCIAL_BEHAVIOR_NOTE)
  const context =
    social.length === 0
      ? 'No attacking, investigating or mounting was detected.'
      : top.label === SOCIAL_BEHAVIOR_NOTE
        ? `Among the named behaviors, ${behaviorInfo(social[0].label).gerund} was most common (${percent(social[0].share)} of the time).`
        : `${social.length === 1 ? 'It was the only named behavior detected.' : `The next most common was ${behaviorInfo(social[1].label).gerund} (${percent(social[1].share)}).`}`

  return {
    headline,
    context,
    leadLabel: top.label,
    duration,
    segmentCount: segments.length,
    meanConfidence: weighted.time > 0 ? weighted.sum / weighted.time : 0,
    longest: {
      label: longestSeg.behavior_label,
      start: longestSeg.start_time,
      end: longestSeg.end_time,
      seconds: longestSeg.end_time - longestSeg.start_time,
    },
  }
}

/** Canonical display order: the fixed vocabulary first, then anything else alphabetically. */
export function orderLabels(labels: readonly string[]): readonly string[] {
  const known = KNOWN_BEHAVIORS.filter((l) => labels.includes(l))
  const rest = labels.filter((l) => !(KNOWN_BEHAVIORS as readonly string[]).includes(l)).sort()
  return [...known, ...rest]
}
