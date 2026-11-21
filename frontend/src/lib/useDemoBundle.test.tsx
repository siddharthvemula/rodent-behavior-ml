import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import appSource from '../App.tsx?raw'
import flowSource from './demoFlow.ts?raw'
import demoSource from './useDemo.ts?raw'
import { DEMO_FLOW } from './demoFlow'
import { useDemoBundle } from './useDemoBundle'

describe('useDemoBundle', () => {
  it('loads nothing until the guide is switched on', async () => {
    const { result, rerender } = renderHook(({ on }) => useDemoBundle(on), { initialProps: { on: false } })
    expect(result.current.status).toBe('idle')
    rerender({ on: true })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    if (result.current.status === 'ready') {
      expect(result.current.bundle.script).toHaveLength(DEMO_FLOW.length)
      expect(result.current.bundle.script.map((s) => s.id)).toEqual(DEMO_FLOW.map((s) => s.id))   // text and structure line up
    }
  })

  it('every flow step has its wording, and the wording adds nothing the flow does not know about', async () => {
    const { result } = renderHook(() => useDemoBundle(true))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    if (result.current.status !== 'ready') throw new Error('not ready')
    for (const [i, s] of result.current.bundle.script.entries()) {
      expect(s).toMatchObject({ ...DEMO_FLOW[i] })
      expect(s.title && s.caveat && s.say.length).toBeTruthy()
    }
  })
})

/**
 * The guided demo's data is parsed when its module is imported. The main bundle must never import it, or a malformed
 * data file would stop the whole app from starting (the same reason the Pharmacology tab is a lazy chunk).
 */
describe('the main bundle stays free of the demo data', () => {
  const HEAVY = /from ['"]\.{1,2}\/(?:lib\/)?(demoBundle|demoData|demoScript|doseResponse)['"]/

  it('App.tsx and the light demo modules import none of the data-parsing modules statically', () => {
    for (const [name, src] of [['App.tsx', appSource], ['demoFlow.ts', flowSource], ['useDemo.ts', demoSource]] as const) {
      expect(src.match(HEAVY)?.[0], name).toBeUndefined()
    }
  })

  it('the only way in is a dynamic import inside the hook', async () => {
    const hook = (await import('./useDemoBundle.ts?raw')).default
    expect(hook).toMatch(/import\(['"]\.\/demoBundle['"]\)/)
    expect(hook).not.toMatch(/^import (?!type\b).* from ['"]\.\/demoBundle['"]/m)   // a type-only import is erased at build time
  })
})
