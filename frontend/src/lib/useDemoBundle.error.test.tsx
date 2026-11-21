import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { useDemoBundle } from './useDemoBundle'

// A data file that fails validation makes importing the bundle throw.
vi.mock('./demoBundle', () => {
  throw new Error('demo_clips.json is malformed')
})

afterEach(() => window.history.replaceState(null, '', '/'))

describe('when the demo data is malformed', () => {
  it('the hook reports an error instead of throwing', async () => {
    const { result } = renderHook(() => useDemoBundle(true))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('the app still starts and works; the guide says it could not load and can be left', async () => {
    window.history.replaceState(null, '', '/#demo=2')
    render(<App mockMode />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/guided demo could not load its data/i)
    expect(screen.getByRole('heading', { name: /per-video behavior timeline/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/keypoints file/i)).toBeInTheDocument()                 // not stuck in a half-demo state
    expect(document.querySelector('[data-demo-card]')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: /leave the demo/i }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(window.location.hash).toBe('')
  })
})
