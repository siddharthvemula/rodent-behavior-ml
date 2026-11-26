import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { CountUpOnView } from './CountUpOnView'

afterEach(() => vi.unstubAllGlobals())

describe('CountUpOnView', () => {
  it('shows the final value at once when motion cannot be detected or observed', () => {
    const { container } = render(<CountUpOnView value={46} />)
    expect(container.textContent).toBe('46')
  })

  it('waits at zero until it is on screen, then counts up to the value', async () => {
    let show: (visible: boolean) => void = () => {}
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          show = (v) => cb([{ isIntersecting: v }])
        }
        observe() {}
        disconnect() {}
      },
    )
    const { container } = render(<CountUpOnView value={46} format={(v) => `−${Math.round(v)}`} />)
    act(() => show(false))
    expect(container.textContent).toBe('−0')
    act(() => show(true))
    await waitFor(() => expect(container.textContent).toBe('−46'), { timeout: 3000 })
  })
})
