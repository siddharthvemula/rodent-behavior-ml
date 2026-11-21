import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DemoStep } from '../lib/demoScript'
import type { DemoController } from '../lib/useDemo'

interface Props {
  readonly steps: readonly DemoStep[]
  readonly demo: DemoController
}

interface Box {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

const PAD = 8
const FIND_FRAMES = 90 // the target may render a moment after the step changes (lazy tab, results); look for ~1.5 s

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Finds the step's target, brings it into view, and reports where it is so the ring can follow it. */
function useSpotlight(target: string | null, stepKey: string) {
  const [box, setBox] = useState<Box | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    setBox(null)
    setMissing(false)
    if (!target) return
    let frame = 0
    let raf = 0
    let el: Element | null = null

    const measure = () => {
      if (!el) return
      const r = el.getBoundingClientRect()
      const next = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
      // Same place as before: keep the old object so React does not re-render every tick.
      setBox((prev) => (prev && prev.top === next.top && prev.left === next.left && prev.width === next.width && prev.height === next.height ? prev : next))
    }

    const find = () => {
      el = document.querySelector(`[data-demo="${target}"]`)
      if (el) {
        if (el instanceof HTMLDetailsElement && !el.open) el.open = true
        // A target taller than most of the screen is aligned to the top (below the bar) instead of centered, so
        // its start is what the audience sees; a smaller one is centered.
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.7
        el.scrollIntoView?.({ block: tall ? 'start' : 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
        measure()
        return
      }
      if (++frame < FIND_FRAMES) raf = requestAnimationFrame(find)
      else setMissing(true)
    }
    find()

    const onMove = () => measure()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    // Smooth scrolling and the app's own entrance animations move the target after we first measure it.
    const settle = window.setInterval(measure, 250)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(settle)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [target, stepKey])

  return { box, missing }
}

/** The guided demo's chrome: a control bar, the talking-point card, and a ring around what the step is about. */
export function DemoGuide({ steps, demo }: Props) {
  const index = demo.index ?? 0
  const step = steps[index]
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [cardHidden, setCardHidden] = useState(false)
  const { box, missing } = useSpotlight(step.target, step.id)
  const interlude = step.kind === 'interlude'

  // The app makes room for the card on wide screens; hiding the notes gives that room back.
  useEffect(() => {
    document.documentElement.dataset.demoNotes = cardHidden ? 'hidden' : 'shown'
    return () => {
      delete document.documentElement.dataset.demoNotes
    }
  }, [cardHidden])

  // H hides or shows the card, to reveal what is underneath it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key.toLowerCase() !== 'h' || e.altKey || e.ctrlKey || e.metaKey || t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return
      setCardHidden((h) => !h)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Announce each step: move focus to its heading (the app underneath stays fully usable).
  useLayoutEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [step.id])

  const next = steps[index + 1]
  const last = index === steps.length - 1

  return (
    <>
      <div className="demo-bar" role="region" aria-label="Guided demo navigation">
        <span className="demo-bar__badge">Guided demo</span>
        <span className="demo-bar__count" aria-live="off">
          Step {index + 1} of {steps.length}
        </span>
        <ol className="demo-bar__dots" aria-label="Steps">
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className="demo-bar__dot"
                aria-label={`Go to step ${i + 1}: ${s.title}`}
                aria-current={i === index ? 'step' : undefined}
                onClick={() => demo.goto(i)}
              />
            </li>
          ))}
        </ol>
        <span className="demo-bar__spacer" />
        <button type="button" className="demo-bar__btn" onClick={demo.prev} disabled={index === 0}>
          Back
        </button>
        <button type="button" className="demo-bar__btn demo-bar__btn--primary" onClick={last ? demo.exit : demo.next}>
          {last ? 'Finish' : 'Next'}
        </button>
        <button type="button" className="demo-bar__btn demo-bar__btn--restart" onClick={() => demo.goto(0)} disabled={index === 0}>
          Restart
        </button>
        <button type="button" className="demo-bar__btn" onClick={() => setCardHidden((h) => !h)} aria-pressed={cardHidden}>
          {cardHidden ? 'Show notes' : 'Hide notes'}
        </button>
        <button type="button" className="demo-bar__btn" onClick={demo.exit} aria-label="Exit the guided demo">
          Exit
        </button>
      </div>

      {box && !interlude && (
        <div className="demo-ring" aria-hidden="true" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
      )}
      {interlude && <div className="demo-dim" aria-hidden="true" />}

      <aside
        hidden={cardHidden && !interlude}
        className={`demo-card${interlude ? ' demo-card--center' : ''}`}
        role="region"
        aria-labelledby="demo-step-title"
        data-demo-card={step.id}
      >
        <p className="demo-card__eyebrow">
          {index + 1} / {steps.length}
        </p>
        <h2 id="demo-step-title" ref={headingRef} tabIndex={-1} className="demo-card__title">
          {step.title}
        </h2>
        <ul className="demo-card__say">
          {step.say.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="demo-card__caveat">
          <strong>Keep in mind:</strong> {step.caveat}
        </p>
        {missing && <p className="demo-card__caveat">This step’s highlight could not be found on the page.</p>}
        <p className="demo-card__hint muted small">
          {last ? 'Press Finish or Esc to leave the demo.' : `Next: ${next.title}`} · ← → step · H hide notes · Esc exit
        </p>
      </aside>
    </>
  )
}
