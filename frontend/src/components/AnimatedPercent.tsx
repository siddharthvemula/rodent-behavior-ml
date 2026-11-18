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
