import type { CSSProperties } from 'react'
import { behaviorInfo } from '../lib/behaviorInfo'
import { percent } from '../lib/summary'
import { donutSegments, type DonutSlice } from '../lib/donut'
import { AnimatedPercent } from './AnimatedPercent'

interface DonutProps {
  readonly name: string
  readonly slices: readonly DonutSlice[]
  /** Shown in the middle when nothing is hovered (the standout behavior). */
  readonly defaultLabel: string | null
  /** The behavior highlighted across the whole card (hover/focus), or null. */
  readonly active: string | null
  readonly onActiveChange: (label: string | null) => void
  readonly delayMs?: number
}

const SWEEP_MS = 1000

/** An animated donut: the ring sweeps in clockwise; the center shows one behavior's share. */
export function Donut({ name, slices, defaultLabel, active, onActiveChange, delayMs = 0 }: DonutProps) {
  const segments = donutSegments(slices)
  const byLabel = new Map(slices.map((s) => [s.label, s]))
  const shown = active ?? defaultLabel
  const shownSlice = shown ? byLabel.get(shown) : undefined

  const summary = slices
    .filter((s) => s.value > 0)
    .map((s) => `${behaviorInfo(s.label).title} ${percent(s.value)}`)
    .join(', ')

  return (
    <figure className="donut" role="img" aria-label={`${name}: ${summary || 'no behaviors detected'}`}>
      <div className="donut__ring">
        <svg viewBox="0 0 42 42" aria-hidden="true" focusable="false">
          <circle className="donut__track" cx="21" cy="21" r="15.9155" fill="none" />
          {segments.map((seg) => {
            const slice = byLabel.get(seg.label)!
            const style = {
              ['--beh' as string]: slice.color,
              strokeDasharray: `${seg.length} ${100 - seg.length}`,
              strokeDashoffset: -seg.start,
              // draw clockwise: each segment starts when the sweep reaches it
              animationDelay: `${delayMs + seg.start * (SWEEP_MS / 100)}ms`,
              animationDuration: `${Math.max(seg.length * (SWEEP_MS / 100), 160)}ms`,
            } as CSSProperties
            return (
              <circle
                key={seg.label}
                className={`donut__seg${active === seg.label ? ' is-active' : ''}${active && active !== seg.label ? ' is-dim' : ''}${defaultLabel === seg.label ? ' is-standout' : ''}`}
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                pathLength={100}
                transform="rotate(-90 21 21)"
                style={style}
                onPointerEnter={() => onActiveChange(seg.label)}
                onPointerLeave={() => onActiveChange(null)}
              />
            )
          })}
        </svg>
        <div className="donut__center">
          <span className="donut__value">{shownSlice ? <AnimatedPercent value={shownSlice.value} delayMs={delayMs} /> : '—'}</span>
          <span className="donut__label">{shown ? behaviorInfo(shown).title : ''}</span>
        </div>
      </div>
      <figcaption className="donut__name">{name}</figcaption>
    </figure>
  )
}
