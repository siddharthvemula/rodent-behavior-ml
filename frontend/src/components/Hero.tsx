import type { CSSProperties, ReactNode } from 'react'
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
  /** The big number on the right (see HeroStat). */
  readonly stat?: ReactNode
}

/** The big plain-language finding at the top of a Summary. */
export function Hero({ label, color, eyebrow, headline, children, context, extra, stat }: HeroProps) {
  const enter = (step: number) => ({ ['--s' as string]: step }) as CSSProperties
  return (
    <section className={`hero${stat ? ' hero--with-stat' : ''}`} style={{ ['--beh' as string]: color }} aria-label="Key finding">
      <div className="hero__main">
        <div className="enter" style={enter(1)}>
          <BehaviorChip label={label} color={color} size="lg" />
        </div>
        <div className="hero__body">
          <p className="hero__eyebrow enter" style={enter(2)}>{eyebrow}</p>
          <h2 className="hero__headline enter" style={enter(3)}>
            <span className="sr-only">{headline}</span>
            <span aria-hidden="true">{children}</span>
          </h2>
          {context && <p className="hero__context enter" style={enter(4)}>{context}</p>}
          {extra && <p className="hero__extra enter" style={enter(5)}>{extra}</p>}
        </div>
      </div>
      {stat}
    </section>
  )
}

interface HeroStatProps {
  /** The number, already animated (e.g. an <AnimatedPercent/>). Shown visually only. */
  readonly children: ReactNode
  readonly unit?: string
  /** Small caps line above the number. */
  readonly label: string
  /** One line under the number. */
  readonly caption: string
  /** What assistive tech should hear instead of the decorative number. */
  readonly spoken: string
}

/** The single oversized figure the Summary leads with: large gradient text with a soft glow. */
export function HeroStat({ children, unit, label, caption, spoken }: HeroStatProps) {
  return (
    <div className="hero-stat enter" style={{ ['--s' as string]: 3 } as CSSProperties}>
      <span className="sr-only">{spoken}</span>
      <p className="hero-stat__label" aria-hidden="true">{label}</p>
      <p className="hero-stat__figure" aria-hidden="true">
        <span className="hero-stat__value">{children}</span>
        {unit && <span className="hero-stat__unit">{unit}</span>}
      </p>
      <p className="hero-stat__caption" aria-hidden="true">{caption}</p>
    </div>
  )
}
