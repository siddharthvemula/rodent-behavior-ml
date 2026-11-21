import { useEffect, useRef, useState } from 'react'
import type { DemoBundle } from './demoBundle'

export type DemoBundleState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly bundle: DemoBundle }

/**
 * Loads the guided demo's data the first time the guide is switched on, and never otherwise. If a data file is
 * malformed the import rejects and the app carries on without the demo, instead of failing to start.
 */
export function useDemoBundle(active: boolean): DemoBundleState {
  const [state, setState] = useState<DemoBundleState>({ status: 'idle' })
  const mounted = useRef(true)
  const started = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!active || started.current) return
    started.current = true // one load per mount; the status below must not re-trigger (or cancel) it
    setState({ status: 'loading' })
    import('./demoBundle').then(
      (m) => mounted.current && setState({ status: 'ready', bundle: m.demoBundle }),
      () => mounted.current && setState({ status: 'error' }),
    )
  }, [active])

  return state
}
