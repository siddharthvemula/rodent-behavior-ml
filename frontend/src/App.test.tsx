import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App', () => {
  it('opens on the per-video timeline view', () => {
    render(<App />)
    expect(screen.getByRole('tab', { name: /timeline/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: /per-video behavior timeline/i })).toBeVisible()
  })

  it('switches to the comparison view and keeps the timeline view state', async () => {
    render(<App />)
    const file = new File(['x'], 'kept.mp4', { type: 'video/mp4' })
    const input = screen.getByLabelText<HTMLInputElement>(/video or keypoint file/i)
    await userEvent.upload(input, file)

    await userEvent.click(screen.getByRole('tab', { name: /control vs treated/i }))
    expect(screen.getByRole('heading', { name: /control vs treated/i })).toBeVisible()
    expect(screen.queryByRole('heading', { name: /per-video behavior timeline/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /timeline/i }))
    expect(input.files?.[0]?.name).toBe('kept.mp4')
    expect(screen.getByRole('button', { name: /predict behaviors/i })).toBeEnabled()
  })
})
