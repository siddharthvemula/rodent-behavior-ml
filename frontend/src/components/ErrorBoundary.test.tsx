import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('render failed')
}

describe('ErrorBoundary', () => {
  it('contains a crashing child and keeps siblings alive', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <p>other tab</p>
        <ErrorBoundary area="the demo">
          <Boom />
        </ErrorBoundary>
      </div>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong showing the demo/i)
    expect(screen.getByText('other tab')).toBeInTheDocument()
  })

  it('renders children normally when nothing fails', () => {
    render(
      <ErrorBoundary area="x">
        <p>fine</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('fine')).toBeInTheDocument()
  })
})
