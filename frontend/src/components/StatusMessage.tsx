import type { TaskState } from '../lib/useAsyncTask'
import { NetworkLoader } from './NetworkLoader'

interface StatusMessageProps {
  readonly state: TaskState<unknown>
  /** From useHeldLoading(isLoading): keeps the globe up for a minimum time so a fast request doesn't flash it. */
  readonly loader: { readonly mounted: boolean; readonly leaving: boolean }
  readonly loadingText: string
  /** Caption for the resting globe shown before the action is started. */
  readonly idleText?: string
}

/** The resting globe before an action, the active globe while it runs, and the error if it fails. */
export function StatusMessage({ state, loader, loadingText, idleText = 'Ready when you are' }: StatusMessageProps) {
  if (loader.mounted || state.status === 'idle') {
    return <NetworkLoader label={loader.mounted ? loadingText : idleText} active={loader.mounted} leaving={loader.leaving} />
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
