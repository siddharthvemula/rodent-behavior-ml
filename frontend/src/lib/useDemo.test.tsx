import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { demoHash, parseDemoHash, useDemo } from './useDemo'

afterEach(() => window.history.replaceState(null, '', '/'))

describe('parseDemoHash', () => {
  it('maps #demo=N to a 0-based step inside 1..total, and anything else to off', () => {
    expect(parseDemoHash('#demo=1', 8)).toBe(0)
    expect(parseDemoHash('#demo=8', 8)).toBe(7)
    for (const bad of ['', '#', '#demo=', '#demo=0', '#demo=9', '#demo=-1', '#demo=2x', '#demo=1.5', '#other=3', 'demo=3']) {
      expect(parseDemoHash(bad, 8), bad).toBeNull()
    }
    expect(demoHash(3)).toBe('#demo=4')
  })
})

describe('useDemo', () => {
  it('starts off, or on the step a link names', () => {
    expect(renderHook(() => useDemo(8)).result.current.index).toBeNull()
    window.history.replaceState(null, '', '/#demo=5')
    expect(renderHook(() => useDemo(8)).result.current.index).toBe(4)
  })

  it('start / next / prev / goto move through the steps, clamp at the ends, and keep the URL in step', () => {
    const { result } = renderHook(() => useDemo(3))
    act(() => result.current.start())
    expect(result.current.index).toBe(0)
    expect(window.location.hash).toBe('#demo=1')
    act(() => result.current.prev())
    expect(result.current.index).toBe(0)
    act(() => result.current.next())
    act(() => result.current.next())
    act(() => result.current.next())
    expect(result.current.index).toBe(2)
    expect(window.location.hash).toBe('#demo=3')
    act(() => result.current.goto(99))
    expect(result.current.index).toBe(2)
    act(() => result.current.goto(-5))
    expect(result.current.index).toBe(0)
  })

  it('exit clears the hash without leaving the page, and does nothing when already off', () => {
    const { result } = renderHook(() => useDemo(3))
    act(() => result.current.next())
    expect(result.current.index).toBeNull()
    act(() => result.current.goto(1))
    act(() => result.current.exit())
    expect(result.current.index).toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('follows the URL when it changes under it', () => {
    const { result } = renderHook(() => useDemo(8))
    act(() => {
      window.history.replaceState(null, '', '/#demo=6')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(result.current.index).toBe(5)
    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(result.current.index).toBeNull()
  })

  it('is driven by the keyboard while on, and ignores it while off, while typing, and with modifiers', () => {
    const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) =>
      act(() => {
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
      })
    const { result } = renderHook(() => useDemo(5))
    press('ArrowRight')
    expect(result.current.index).toBeNull()                       // off: keys do nothing

    act(() => result.current.start())
    press('ArrowRight')
    press('PageDown')
    expect(result.current.index).toBe(2)
    press('ArrowLeft')
    expect(result.current.index).toBe(1)
    press('End')
    expect(result.current.index).toBe(4)
    press('Home')
    expect(result.current.index).toBe(0)

    press('ArrowRight', { ctrlKey: true })                        // browser/OS shortcuts are left alone
    press('ArrowRight', { metaKey: true })
    expect(result.current.index).toBe(0)

    const input = document.createElement('input')
    document.body.appendChild(input)
    press('ArrowRight', {}, input)                                // typing in a field is left alone
    expect(result.current.index).toBe(0)
    input.remove()

    press('Escape')
    expect(result.current.index).toBeNull()
  })
})
