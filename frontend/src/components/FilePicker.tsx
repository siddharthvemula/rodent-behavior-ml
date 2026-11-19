import { useId, useState, type ChangeEvent } from 'react'
import { checkKeypointsFile } from '../lib/fileChecks'

interface FilePickerProps {
  readonly label: string
  readonly hint?: string
  readonly onChange: (file: File | null) => void
  readonly disabled?: boolean
}

export function FilePicker({ label, hint, onChange, disabled = false }: FilePickerProps) {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const [problem, setProblem] = useState<string | null>(null)

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    const found = file ? checkKeypointsFile(file) : null
    setProblem(found)
    // A file that fails the quick checks is treated as "nothing selected", so the run button stays disabled.
    onChange(found ? null : file)
  }

  return (
    <div className="file-picker">
      <label htmlFor={inputId} className="file-picker__label">
        {label}
      </label>
      <input
        id={inputId}
        type="file"
        accept=".json,application/json"
        onChange={handleChange}
        disabled={disabled}
        aria-describedby={[hint ? hintId : null, problem ? errorId : null].filter(Boolean).join(' ') || undefined}
        aria-invalid={problem ? true : undefined}
      />
      {hint && (
        <span id={hintId} className="file-picker__hint">
          {hint}
        </span>
      )}
      {problem && (
        <span id={errorId} className="file-picker__error" role="alert">
          {problem}
        </span>
      )}
    </div>
  )
}
