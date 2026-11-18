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

  it('shows a demo-mode banner only when serving canned data', () => {
    const { unmount } = render(<App mockMode />)
    expect(screen.getByRole('note')).toHaveTextContent(/demo mode.*canned sample data/i)
    unmount()

    render(<App mockMode={false} />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('switches to the comparison view and keeps the timeline view state', async () => {
    render(<App />)
    const file = new File(['{}'], 'kept.json', { type: 'application/json' })
    const input = screen.getByLabelText<HTMLInputElement>(/keypoints file/i)
    await userEvent.upload(input, file)

    await userEvent.click(screen.getByRole('tab', { name: /control vs treated/i }))
    expect(screen.getByRole('heading', { name: /control vs treated/i })).toBeVisible()
    expect(screen.queryByRole('heading', { name: /per-video behavior timeline/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /timeline/i }))
    expect(input.files?.[0]?.name).toBe('kept.json')
    expect(screen.getByRole('button', { name: /predict behaviors/i })).toBeEnabled()
  })
})
