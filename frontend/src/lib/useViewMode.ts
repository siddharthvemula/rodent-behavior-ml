import { useCallback, useState } from 'react'

export type ViewMode = 'summary' | 'detail'

const STORAGE_KEY = 'rodent-behavior:view-mode'

function readStored(): ViewMode | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'summary' || value === 'detail' ? value : null
  } catch {
    return null // storage can be blocked (private windows, previews); the toggle still works
  }
}

/** Summary/Detail toggle state, remembered per browser as a convenience. */
export function useViewMode(initial: ViewMode = 'summary') {
  const [mode, setModeState] = useState<ViewMode>(() => readStored() ?? initial)

  const setMode = useCallback((next: ViewMode) => {
    setModeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* not persisted; fine */
    }
  }, [])

  return [mode, setMode] as const
}
