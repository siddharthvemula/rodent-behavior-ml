import { useCallback, useRef, useState } from 'react'

export type TaskState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'success'; readonly data: T }

const FALLBACK_ERROR_MESSAGE = 'Something went wrong. Please try again.'

/**
 * Tracks one async request. If `run` is called again before the previous
 * call settles, the stale result is dropped so the UI never shows output
 * for a file the user has already replaced.
 */
export function useAsyncTask<T>() {
  const [state, setState] = useState<TaskState<T>>({ status: 'idle' })
  const latestRun = useRef(0)

  const run = useCallback(async (task: () => Promise<T>) => {
    latestRun.current += 1
    const runId = latestRun.current
    setState({ status: 'loading' })
    try {
      const data = await task()
      if (runId === latestRun.current) setState({ status: 'success', data })
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : FALLBACK_ERROR_MESSAGE
      if (runId === latestRun.current) setState({ status: 'error', message })
    }
  }, [])

  const reset = useCallback(() => {
    latestRun.current += 1
    setState({ status: 'idle' })
  }, [])

  return { state, run, reset } as const
}
