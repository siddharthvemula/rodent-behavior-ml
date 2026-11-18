import type { BehaviorSegment, CompareResult } from '../api/types'

export interface BehaviorTotal {
  readonly label: string
  readonly seconds: number
  readonly share: number
}

export interface TimelineSummary {
  readonly duration: number
  readonly totals: readonly BehaviorTotal[]
}

export interface CompareRow {
  readonly label: string
  readonly control: number
  readonly treated: number
  readonly difference: number
}

// The backend's behavior vocabulary is fixed (CalMS21 Task 1, see
// ARCHITECTURE.md "Data schema"), so each known label has ONE color
// everywhere. Colors must not depend on which labels happen to appear in a
// given clip, or the same behavior would change color between recordings and
// between the Summary and Detail views. They are CSS variables (defined for
// light and dark in index.css, validated with the dataviz palette checks) so
// the theme can swap them. `other` is the ~60% background class, so it is a
// quiet neutral rather than a vivid color.
const KNOWN_BEHAVIOR_COLORS: Readonly<Record<string, string>> = {
  attack: 'var(--beh-attack)',
  investigation: 'var(--beh-investigation)',
  mount: 'var(--beh-mount)',
  other: 'var(--beh-other)',
}

// Fallback for any label outside the fixed vocabulary (e.g. a future backend
// change); distinct from the four above.
const EXTRA_PALETTE = [
  'var(--beh-extra-1)',
  'var(--beh-extra-2)',
  'var(--beh-extra-3)',
  'var(--beh-extra-4)',
  'var(--beh-extra-5)',
] as const

/** The fixed vocabulary in display order (attack first, background class last). */
export const KNOWN_BEHAVIORS = ['attack', 'investigation', 'mount', 'other'] as const

/**
 * Maps each distinct label to a color. Known labels always get their fixed
 * color; unknown labels get an extra-palette color by sorted position, so the
 * result is independent of input order.
 */
export function buildColorMap(labels: readonly string[]): Readonly<Record<string, string>> {
  const unique = [...new Set(labels)].sort()
  const unknown = unique.filter((label) => !(label in KNOWN_BEHAVIOR_COLORS))
  return Object.fromEntries(
    unique.map((label) => [
      label,
      KNOWN_BEHAVIOR_COLORS[label] ?? EXTRA_PALETTE[unknown.indexOf(label) % EXTRA_PALETTE.length],
    ]),
  )
}

export function formatSeconds(totalSeconds: number): string {
  const tenths = Math.round(totalSeconds * 10)
  const minutes = Math.floor(tenths / 600)
  const seconds = (tenths % 600) / 10
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`
}

export function summarizeTimeline(segments: readonly BehaviorSegment[]): TimelineSummary {
  if (segments.length === 0) return { duration: 0, totals: [] }

  const start = Math.min(...segments.map((s) => s.start_time))
  const end = Math.max(...segments.map((s) => s.end_time))
  const duration = end - start

  const secondsByLabel = segments.reduce<Readonly<Record<string, number>>>(
    (acc, s) => ({ ...acc, [s.behavior_label]: (acc[s.behavior_label] ?? 0) + (s.end_time - s.start_time) }),
    {},
  )

  const totals = Object.entries(secondsByLabel)
    .map(([label, seconds]) => ({ label, seconds, share: duration > 0 ? seconds / duration : 0 }))
    .sort((a, b) => b.seconds - a.seconds)

  return { duration, totals }
}

export function buildCompareRows(result: CompareResult): readonly CompareRow[] {
  const labels = [...new Set([...Object.keys(result.control), ...Object.keys(result.treated)])]
  return labels
    .map((label) => {
      const control = result.control[label] ?? 0
      const treated = result.treated[label] ?? 0
      const difference = result.difference[label] ?? treated - control
      return { label, control, treated, difference }
    })
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
}
