import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHeldLoading } from './useHeldLoading'

describe('useHeldLoading', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('holds a very short load for the minimum time, then fades and unmounts', () => {
    const { result, rerender } = renderHook(({ on }) => useHeldLoading(on, 400, 150), { initialProps: { on: false } })
    expect(result.current.mounted).toBe(false)

    rerender({ on: true })
    expect(result.current.mounted).toBe(true)

    act(() => { vi.advanceTimersByTime(50) })
    rerender({ on: false })                       // request finished after 50 ms
    expect(result.current).toEqual({ mounted: true, leaving: false })

    act(() => { vi.advanceTimersByTime(349) })
    expect(result.current.leaving).toBe(false)
    act(() => { vi.advanceTimersByTime(1) })      // 400 ms since it appeared
    expect(result.current).toEqual({ mounted: true, leaving: true })
    act(() => { vi.advanceTimersByTime(150) })
    expect(result.current.mounted).toBe(false)
  })

  it('does not add delay when the load already outlasted the minimum', () => {
    const { result, rerender } = renderHook(({ on }) => useHeldLoading(on, 400, 150), { initialProps: { on: true } })
    act(() => { vi.advanceTimersByTime(2000) })
    rerender({ on: false })
    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.leaving).toBe(true)
  })
})
