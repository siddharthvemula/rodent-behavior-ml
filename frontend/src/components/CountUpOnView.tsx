import { useEffect, useRef, useState } from 'react'
import { HERO_COUNT_MS } from '../lib/motion'
import { prefersReducedMotion, useCountUp } from '../lib/useCountUp'

interface Props {
  readonly value: number
  /** How to print the number while it counts; defaults to a whole number. */
  readonly format?: (v: number) => string
}

const whole = (v: number) => String(Math.round(v))

function Counting({ value, format }: Required<Props>) {
  return <>{format(useCountUp(value, 900, HERO_COUNT_MS))}</>
}

/**
 * A headline number that counts up like the Compare Recordings one, but only once it can be seen. These tabs can be
 * mounted while hidden and have headlines below the fold, so counting from mount would finish unwatched.
 * Visual only: callers give assistive tech the final value in text.
 */
export function CountUpOnView({ value, format = whole }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const [seen, setSeen] = useState(() => prefersReducedMotion() || typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (seen || !ref.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true)
      },
      { threshold: 0.6 },
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [seen])

  return <span ref={ref}>{seen ? <Counting value={value} format={format} /> : format(0)}</span>
}
