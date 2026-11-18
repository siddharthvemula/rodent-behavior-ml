import { useEffect, useRef, useState } from 'react'

/** True when we should skip motion: the user asked for less, or we can't tell (e.g. tests). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

/** Later changes (e.g. the highlighted donut segment switching) should feel immediate. */
const RETARGET_MS = 420

/**
 * Animates a number from 0 (then from wherever it is) to `target`. Returns the
 * final value immediately under reduced motion. The delay is an entrance delay:
 * it applies only to the first run, so a later change to `target` starts at
 * once and runs quicker. Callers should keep the real value available to
 * assistive tech (the animated text is decoration).
 */
export function useCountUp(target: number, durationMs = 900, delayMs = 0): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0))
  const current = useRef(value)
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (prefersReducedMotion()) {
      current.current = target
      setValue(target)
      return
    }
    const from = current.current
    const delay = hasAnimated.current ? 0 : delayMs
    const duration = hasAnimated.current ? RETARGET_MS : durationMs
    hasAnimated.current = true
    let frame = 0
    let start: number | null = null
    const step = (now: number) => {
      if (start === null) start = now + delay
      const t = Math.min(Math.max((now - start) / duration, 0), 1)
      const next = from + (target - from) * easeOutCubic(t)
      current.current = next
      setValue(next)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs, delayMs])

  return value
}
