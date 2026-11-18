import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompareView } from './CompareView'
import compareMock from '../mocks/compare.json'
import type { ApiClient } from '../api/client'

function fakeApi(compare: ApiClient['compare']): Pick<ApiClient, 'compare'> {
  return { compare }
}

const control = new File(['c'], 'control.mp4', { type: 'video/mp4' })
const treated = new File(['t'], 'treated.mp4', { type: 'video/mp4' })

describe('CompareView', () => {
  it('requires both control and treated files before running', async () => {
    render(<CompareView api={fakeApi(vi.fn())} />)
    const button = screen.getByRole('button', { name: /compare/i })
    expect(button).toBeDisabled()

    await userEvent.upload(screen.getByLabelText(/control/i), control)
    expect(button).toBeDisabled()

    await userEvent.upload(screen.getByLabelText(/treated/i), treated)
    expect(button).toBeEnabled()
  })

  it('sends control then treated and renders a side-by-side comparison', async () => {
    const compare = vi.fn<ApiClient['compare']>().mockResolvedValue(compareMock.result)
    render(<CompareView api={fakeApi(compare)} />)

    await userEvent.upload(screen.getByLabelText(/control/i), control)
    await userEvent.upload(screen.getByLabelText(/treated/i), treated)
    await userEvent.click(screen.getByRole('button', { name: /compare/i }))

    expect(compare).toHaveBeenCalledWith(control, treated)
    const table = await screen.findByRole('table', { name: /behavior frequency comparison/i })
    const groomingRow = within(table).getByRole('row', { name: /grooming/i })
    expect(within(groomingRow).getByText('0.40')).toBeInTheDocument()
    expect(within(groomingRow).getByText('0.12')).toBeInTheDocument()
    expect(within(groomingRow).getByText('-0.28')).toBeInTheDocument()
    const investigationRow = within(table).getByRole('row', { name: /investigation/i })
    expect(within(investigationRow).getByText('+0.13')).toBeInTheDocument()
  })

  it('shows the error when comparison fails', async () => {
    const compare = vi.fn<ApiClient['compare']>().mockRejectedValue(new Error('Inference job j timed out'))
    render(<CompareView api={fakeApi(compare)} />)

    await userEvent.upload(screen.getByLabelText(/control/i), control)
    await userEvent.upload(screen.getByLabelText(/treated/i), treated)
    await userEvent.click(screen.getByRole('button', { name: /compare/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('timed out')
  })
})
