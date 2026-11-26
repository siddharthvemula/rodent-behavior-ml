import type { ReactNode } from 'react'

/** The caveats and method notes of a tab: all of the text, collapsed until asked for. */
export function Methodology({ children }: { readonly children: ReactNode }) {
  return (
    <details className="card method" data-testid="methodology">
      <summary>
        <span className="method__title">Methodology and caveats</span>
        <span className="muted method__hint">What these results can and cannot show, and how they were computed</span>
      </summary>
      <div className="method__body">{children}</div>
    </details>
  )
}
