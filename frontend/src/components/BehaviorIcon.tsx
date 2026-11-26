import type { ReactNode } from 'react'

// Simple stroke icons (24x24, currentColor) drawn for this app. Decorative:
// every use sits beside the behavior's text label, so they are aria-hidden.
const ICONS: Readonly<Record<string, ReactNode>> = {
  // bolt: sudden, forceful contact
  attack: <polygon points="13 2 4 14 11.5 14 10.5 22 20 9.5 12.5 9.5 13 2" />,
  // magnifier: sniffing and exploring
  investigation: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <line x1="20.5" y1="20.5" x2="15.8" y2="15.8" />
    </>
  ),
  // stacked chevrons: climbing on
  mount: (
    <>
      <polyline points="6.5 11 12 5.5 17.5 11" />
      <polyline points="6.5 18.5 12 13 17.5 18.5" />
    </>
  ),
  // bars: a section's headline result (not a behavior)
  finding: (
    <>
      <line x1="6" y1="20" x2="6" y2="13" />
      <line x1="12" y1="20" x2="12" y2="5" />
      <line x1="18" y1="20" x2="18" y2="10" />
    </>
  ),
  // dots: everything else
  other: (
    <>
      <circle cx="5.5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18.5" cy="12" r="1.3" />
    </>
  ),
}

const FALLBACK = <circle cx="12" cy="12" r="3.5" />

interface BehaviorIconProps {
  readonly label: string
  readonly size?: number
}

export function BehaviorIcon({ label, size = 20 }: BehaviorIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[label] ?? FALLBACK}
    </svg>
  )
}

interface BehaviorChipProps {
  readonly label: string
  readonly color: string
  readonly size?: 'md' | 'lg'
}

/** The behavior's color as a tinted tile holding its icon (the glyph stays in text ink for contrast). */
export function BehaviorChip({ label, color, size = 'md' }: BehaviorChipProps) {
  return (
    <span className={`chip chip--${size}`} style={{ ['--beh' as string]: color }} aria-hidden="true">
      <BehaviorIcon label={label} size={size === 'lg' ? 26 : 20} />
    </span>
  )
}
