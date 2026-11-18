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

// Categorical palette, readable on both light and dark backgrounds.
const BEHAVIOR_PALETTE = [
  '#3b82f6',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#84cc16',
] as const

/**
 * Assigns each distinct label a palette color by its sorted position, so
 * colors never collide for up to BEHAVIOR_PALETTE.length behaviors and the
 * same label set always gets the same colors.
 */
export function buildColorMap(labels: readonly string[]): Readonly<Record<string, string>> {
  const unique = [...new Set(labels)].sort()
  return Object.fromEntries(unique.map((label, i) => [label, BEHAVIOR_PALETTE[i % BEHAVIOR_PALETTE.length]]))
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
