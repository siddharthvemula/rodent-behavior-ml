import { useCountUp } from '../lib/useCountUp'
import { percent } from '../lib/summary'

interface AnimatedPercentProps {
  /** A fraction, 0-1. */
  readonly value: number
  readonly delayMs?: number
}

/** Counts up to a percentage; purely visual (callers keep the real value in text for assistive tech). */
export function AnimatedPercent({ value, delayMs = 0 }: AnimatedPercentProps) {
  return <>{percent(useCountUp(value, 900, delayMs))}</>
}

interface AnimatedPointsProps {
  /** A difference of fractions (-1..1); shown as signed percentage points. */
  readonly difference: number
  readonly delayMs?: number
}

/** "+44" / "−49": a signed percentage-point change that counts up from 0. */
export function AnimatedPoints({ difference, delayMs = 0 }: AnimatedPointsProps) {
  const points = Math.round(Math.abs(difference) * 100)
  const shown = Math.round(useCountUp(points, 900, delayMs))
  return <>{difference < 0 ? '−' : '+'}{shown}</>
}
