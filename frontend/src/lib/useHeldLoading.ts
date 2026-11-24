import { useEffect, useRef, useState } from 'react'

export const MIN_VISIBLE_MS = 2000
export const FADE_MS = 150

/**
 * Keeps a loading indicator on screen for at least `minMs` once it appears,
 * then fades it out over `fadeMs`, so a fast request doesn't flash it for a
 * fraction of a second. Purely presentational: it follows `active` and never
 * touches the request itself.
 */
export function useHeldLoading(active: boolean, minMs = MIN_VISIBLE_MS, fadeMs = FADE_MS) {
  const [mounted, setMounted] = useState(active)
  const [leaving, setLeaving] = useState(false)
  const shownAt = useRef(active ? Date.now() : 0)

  useEffect(() => {
    if (active) {
      shownAt.current = Date.now()
      setMounted(true)
      setLeaving(false)
      return
    }
    if (!mounted) return
    const wait = Math.max(0, minMs - (Date.now() - shownAt.current))
    const fadeTimer = window.setTimeout(() => setLeaving(true), wait)
    const doneTimer = window.setTimeout(() => setMounted(false), wait + fadeMs)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(doneTimer)
    }
    // `mounted` is intentionally read, not a trigger: only `active` flips drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, minMs, fadeMs])

  return { mounted, leaving } as const
}
