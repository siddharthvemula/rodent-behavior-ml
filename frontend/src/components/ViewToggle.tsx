import type { ViewMode } from '../lib/useViewMode'

interface ViewToggleProps {
  readonly mode: ViewMode
  readonly onChange: (mode: ViewMode) => void
}

const OPTIONS: readonly { readonly id: ViewMode; readonly label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'detail', label: 'Detail' },
]

/** Segmented control with a sliding highlight; both options are real buttons. */
export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="view-toggle" role="group" aria-label="Results view" data-mode={mode}>
      <span className="view-toggle__pill" aria-hidden="true" />
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className="view-toggle__option"
          aria-pressed={mode === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
