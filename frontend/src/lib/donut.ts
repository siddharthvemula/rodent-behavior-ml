// Ring geometry for the donut charts (pure, so it is unit-tested).

export interface DonutSlice {
  readonly label: string
  /** A fraction of the whole (0-1); zero slices draw nothing. */
  readonly value: number
  readonly color: string
}

export interface DonutSegment {
  readonly label: string
  /** Start and length along the ring, in percent of the circumference. */
  readonly start: number
  readonly length: number
  readonly share: number
}

const GAP = 1.1 // percent of the ring left open between segments (the "surface gap")
const MIN_LENGTH = 0.5

/**
 * Ring geometry for the slices: shares are normalized to the ring (so
 * rounding in the data can't leave a hole), zero slices are dropped, and a
 * small gap separates neighbors. Pure, so it is unit-tested.
 */
export function donutSegments(slices: readonly DonutSlice[]): readonly DonutSegment[] {
  const visible = slices.filter((s) => s.value > 0)
  const total = visible.reduce((sum, s) => sum + s.value, 0)
  if (total <= 0) return []
  const gap = visible.length > 1 ? GAP : 0
  let cursor = 0
  return visible.map((s) => {
    const share = s.value / total
    const full = share * 100
    const segment = { label: s.label, start: cursor + gap / 2, length: Math.max(full - gap, MIN_LENGTH), share }
    cursor += full
    return segment
  })
}
