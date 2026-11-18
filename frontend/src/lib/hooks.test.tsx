import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion, useCountUp } from './useCountUp'
import { useViewMode } from './useViewMode'

function stubMatchMedia(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query }))
}

// An in-memory localStorage, so these tests do not depend on which Node/jsdom
// combination provides one (Node 25+ ships an experimental global that can
// shadow jsdom's and be undefined here).
function installStorage(overrides: Partial<Storage> = {}) {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    ...overrides,
  }
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
  return storage
}

beforeEach(() => {
  installStorage()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useCountUp', () => {
  it('returns the final value immediately when motion can not be judged (no matchMedia)', () => {
    expect(prefersReducedMotion()).toBe(true)
    expect(renderHook(() => useCountUp(0.44)).result.current).toBe(0.44)
  })

  it('returns the final value immediately under prefers-reduced-motion', () => {
    stubMatchMedia(true)
    expect(renderHook(() => useCountUp(0.44)).result.current).toBe(0.44)
  })

  it('counts up from 0 to the target otherwise', () => {
    stubMatchMedia(false)
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const { result } = renderHook(() => useCountUp(0.5, 900))
    expect(result.current).toBe(0)
    act(() => void vi.advanceTimersByTime(450))
    expect(result.current).toBeGreaterThan(0.2)
    expect(result.current).toBeLessThan(0.5)
    act(() => void vi.advanceTimersByTime(1000))
    expect(result.current).toBeCloseTo(0.5, 5)
  })
})

describe('useViewMode', () => {
  it('defaults to summary and remembers the choice', () => {
    const first = renderHook(() => useViewMode())
    expect(first.result.current[0]).toBe('summary')
    act(() => first.result.current[1]('detail'))
    expect(first.result.current[0]).toBe('detail')
    expect(renderHook(() => useViewMode()).result.current[0]).toBe('detail')
  })

  it('works with no localStorage at all', () => {
    Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true })
    const { result } = renderHook(() => useViewMode())
    expect(result.current[0]).toBe('summary')
    act(() => result.current[1]('detail'))
    expect(result.current[0]).toBe('detail')
  })

  it('ignores a garbage stored value', () => {
    window.localStorage.setItem('rodent-behavior:view-mode', 'nonsense')
    expect(renderHook(() => useViewMode()).result.current[0]).toBe('summary')
  })

  it('still works when storage is blocked', () => {
    installStorage({
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const { result } = renderHook(() => useViewMode())
    expect(result.current[0]).toBe('summary')
    act(() => result.current[1]('detail'))
    expect(result.current[0]).toBe('detail')
  })
})
