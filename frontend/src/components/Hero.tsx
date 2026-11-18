import type { ReactNode } from 'react'
import { BehaviorChip } from './BehaviorIcon'

interface HeroProps {
  /** Behavior whose color/icon anchors the card. */
  readonly label: string
  readonly color: string
  readonly eyebrow: string
  /** The full headline as plain text, read by assistive tech. */
  readonly headline: string
  /** The same headline with animated numbers, shown visually. */
  readonly children: ReactNode
  readonly context?: string
  readonly extra?: string
}

/** The big plain-language finding at the top of a Summary. */
export function Hero({ label, color, eyebrow, headline, children, context, extra }: HeroProps) {
  return (
    <section className="hero" style={{ ['--beh' as string]: color }} aria-label="Key finding">
      <BehaviorChip label={label} color={color} size="lg" />
      <div className="hero__body">
        <p className="hero__eyebrow">{eyebrow}</p>
        <h2 className="hero__headline">
          <span className="sr-only">{headline}</span>
          <span aria-hidden="true">{children}</span>
        </h2>
        {context && <p className="hero__context">{context}</p>}
        {extra && <p className="hero__extra">{extra}</p>}
      </div>
    </section>
  )
}
