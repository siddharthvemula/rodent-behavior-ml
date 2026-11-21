import { useCallback, useEffect, useState } from 'react'

const PREFIX = '#demo='

/** "#demo=3" -> 2 (0-based). Anything else, or a step outside 1..total, means the guide is off. */
export function parseDemoHash(hash: string, total: number): number | null {
  if (!hash.startsWith(PREFIX)) return null
  const raw = hash.slice(PREFIX.length)
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return n >= 1 && n <= total ? n - 1 : null
}

export const demoHash = (index: number) => `${PREFIX}${index + 1}`

function writeHash(hash: string) {
  // replaceState: stepping through the demo must not fill the browser history, and clearing must not scroll.
  const base = window.location.pathname + window.location.search
  window.history.replaceState(null, '', hash ? base + hash : base)
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export interface DemoController {
  /** 0-based step, or null when the guide is off. */
  readonly index: number | null
  readonly total: number
  readonly start: () => void
  readonly goto: (index: number) => void
  readonly next: () => void
  readonly prev: () => void
  readonly exit: () => void
}

/**
 * The guided demo's state: which step is showing. The URL hash (#demo=N) is the source of truth on load, so a link
 * opens the demo at that step; arrow keys step through it, Escape leaves it.
 */
export function useDemo(total: number): DemoController {
  const [index, setIndex] = useState<number | null>(() => parseDemoHash(window.location.hash, total))

  const goto = useCallback(
    (i: number) => {
      const clamped = Math.min(Math.max(i, 0), total - 1)
      writeHash(demoHash(clamped))
      setIndex(clamped)
    },
    [total],
  )
  const exit = useCallback(() => {
    writeHash('')
    setIndex(null)
  }, [])
  const start = useCallback(() => goto(0), [goto])
  const next = useCallback(() => {
    if (index !== null) goto(index + 1)
  }, [index, goto])
  const prev = useCallback(() => {
    if (index !== null) goto(index - 1)
  }, [index, goto])

  // Someone edits the URL or follows a #demo=N link while the page is open.
  useEffect(() => {
    const onHash = () => setIndex(parseDemoHash(window.location.hash, total))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [total])

  const active = index !== null
  useEffect(() => {
    if (!active) return
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return
      const go = (fn: () => void) => {
        e.preventDefault()
        fn()
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(next)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(prev)
      else if (e.key === 'Home') go(() => goto(0))
      else if (e.key === 'End') go(() => goto(total - 1))
      else if (e.key === 'Escape') go(exit)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, next, prev, goto, exit, total])

  return { index, total, start, goto, next, prev, exit }
}
