import type { CSSProperties, ReactNode } from 'react'

export type StatIconName = 'clock' | 'layers' | 'gauge'

// Generic stroke icons for the stat tiles, drawn like the behavior icons (24x24, currentColor).
const ICONS: Readonly<Record<StatIconName, ReactNode>> = {
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <polyline points="12 7.5 12 12 15.2 13.8" />
    </>
  ),
  layers: (
    <>
      <polygon points="12 3.5 3.5 8 12 12.5 20.5 8" />
      <polyline points="3.5 12 12 16.5 20.5 12" />
      <polyline points="3.5 16 12 20.5 20.5 16" />
    </>
  ),
  gauge: (
    <>
      <path d="M4.5 16.5a8 8 0 1 1 15 0" />
      <line x1="12" y1="15.5" x2="15.8" y2="10.8" />
    </>
  ),
}

interface StatTileProps {
  readonly label: string
  readonly children: ReactNode
  readonly hint?: string
  /** Entrance step (see .enter in summary.css). */
  readonly step: number
  /** A generic icon, or an `icon` node (e.g. a behavior chip's glyph) with its own color. */
  readonly icon: StatIconName | ReactNode
  /** Tile accent color (hover glow, chip tint); neutral when omitted. */
  readonly color?: string
}

/** One key number: tinted icon chip, label, animated value, optional hint. Same chip pattern as the behavior rows. */
export function StatTile({ label, children, hint, step, icon, color = 'var(--text-muted)' }: StatTileProps) {
  const glyph =
    typeof icon === 'string' && icon in ICONS ? (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {ICONS[icon as StatIconName]}
      </svg>
    ) : (
      icon
    )
  return (
    <div className="tile enter" style={{ ['--s' as string]: step, ['--beh' as string]: color } as CSSProperties}>
      <div className="tile__head">
        <span className="chip chip--sm" aria-hidden="true">{glyph}</span>
        <span className="tile__label">{label}</span>
      </div>
      <span className="tile__value">{children}</span>
      {hint && <span className="tile__hint muted">{hint}</span>}
    </div>
  )
}
