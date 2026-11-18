import { useId, type ChangeEvent } from 'react'

interface FilePickerProps {
  readonly label: string
  readonly hint?: string
  readonly onChange: (file: File | null) => void
  readonly disabled?: boolean
}

export function FilePicker({ label, hint, onChange, disabled = false }: FilePickerProps) {
  const inputId = useId()
  const hintId = `${inputId}-hint`

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.files?.[0] ?? null)
  }

  return (
    <div className="file-picker">
      <label htmlFor={inputId} className="file-picker__label">
        {label}
      </label>
      <input
        id={inputId}
        type="file"
        onChange={handleChange}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && (
        <span id={hintId} className="file-picker__hint">
          {hint}
        </span>
      )}
    </div>
  )
}
