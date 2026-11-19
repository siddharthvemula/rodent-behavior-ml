// Shared axis for the A-vs-B change chart: 0 to the largest value rounded up
// to the next 10%, never below 10%, so tiny differences don't fill the plot.
export function changeAxisMax(values: readonly number[]): number {
  const largest = values.length > 0 ? Math.max(...values) : 0
  return Math.max(0.1, Math.ceil(largest * 10 - 1e-9) / 10)
}

const STEPS = [0.05, 0.1, 0.2, 0.25, 0.5] as const

/** Gridline values from 0 to `max` at a round step (5/10/20/25/50%), at most six lines. */
export function axisTicks(max: number): readonly number[] {
  const step = STEPS.find((s) => max / s <= 5 + 1e-9) ?? STEPS[STEPS.length - 1]
  const count = Math.round(max / step)
  const ticks = Array.from({ length: count + 1 }, (_, i) => +(i * step).toFixed(4))
  return ticks[ticks.length - 1] < max - 1e-9 ? [...ticks, max] : ticks
}
