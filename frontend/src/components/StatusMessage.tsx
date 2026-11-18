import type { TaskState } from '../lib/useAsyncTask'

interface StatusMessageProps {
  readonly state: TaskState<unknown>
  readonly loadingText: string
}

export function StatusMessage({ state, loadingText }: StatusMessageProps) {
  if (state.status === 'loading') {
    return (
      <p className="status status--loading" role="status">
        <span className="spinner" aria-hidden="true" /> {loadingText}
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <p className="status status--error" role="alert">
        {state.message}
      </p>
    )
  }
  return null
}
