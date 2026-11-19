// Shared axis for the A-vs-B change chart. The axis runs from 0 to the largest
// value rounded up to a whole gridline step (never below 10%), so the last
// gridline sits exactly at the end and tiny differences don't fill the plot.
const STEPS = [0.05, 0.1, 0.2, 0.25, 0.5] as const
const EPS = 1e-9

const stepFor = (max: number) => STEPS.find((s) => max / s <= 5 + EPS) ?? STEPS[STEPS.length - 1]

export function changeAxisMax(values: readonly number[]): number {
  const largest = values.length > 0 ? Math.max(...values) : 0
  const tenth = Math.max(0.1, Math.ceil(largest * 10 - EPS) / 10)
  const step = stepFor(tenth)
  return +(Math.ceil(tenth / step - EPS) * step).toFixed(4)
}

/** Gridline values from 0 to `max` at a round step (5/10/20/25/50%). `max` should come from changeAxisMax. */
export function axisTicks(max: number): readonly number[] {
  const step = stepFor(max)
  const count = Math.max(1, Math.round(max / step))
  return Array.from({ length: count + 1 }, (_, i) => +(i * step).toFixed(4))
}
