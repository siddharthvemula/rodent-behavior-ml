import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompareView } from './CompareView'
import compareMock from '../mocks/compare.json'
import type { ApiClient } from '../api/client'

function fakeApi(compare: ApiClient['compare']): Pick<ApiClient, 'compare'> {
  return { compare }
}

const control = new File(['{}'], 'control.json', { type: 'application/json' })
const treated = new File(['{}'], 'treated.json', { type: 'application/json' })

describe('CompareView with a preloaded result (guided demo)', () => {
  const outcome = { result: compareMock.result, warnings: [], durations: { control: 100, treated: 100 }, intervals: null }

  it('shows the result straight away, with no upload form and no API call', () => {
    const compare = vi.fn<ApiClient['compare']>()
    render(<CompareView api={fakeApi(compare)} preloaded={outcome} mode="detail" />)
    expect(screen.queryByLabelText(/keypoints/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /compare behaviors/i })).not.toBeInTheDocument()
    expect(screen.getByRole('table', { name: /behavior frequency comparison/i })).toBeInTheDocument()
    expect(compare).not.toHaveBeenCalled()
  })

  it('names the recordings Clip A / Clip B everywhere when asked to, including the lengths line', () => {
    const { container } = render(<CompareView preloaded={outcome} names={{ a: 'Clip A', b: 'Clip B' }} mode="detail" />)
    const table = screen.getByRole('table', { name: /behavior frequency comparison/i })
    expect(within(table).getByRole('columnheader', { name: 'Clip A' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Clip B' })).toBeInTheDocument()
    expect(container.textContent).toMatch(/Clip A: 1 min 40 s · Clip B: 1 min 40 s/)
    expect(container.textContent).toMatch(/clip B − clip A/)
    expect(container.textContent).not.toMatch(/recording [ab]/i)
  })

  it('keeps the usual names by default', () => {
    render(<CompareView preloaded={outcome} mode="detail" />)
    const table = screen.getByRole('table', { name: /behavior frequency comparison/i })
    expect(within(table).getByRole('columnheader', { name: 'Recording A' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Recording B' })).toBeInTheDocument()
  })
})

describe('CompareView', () => {
  it('requires both recording files before running', async () => {
    render(<CompareView api={fakeApi(vi.fn())} />)
    const button = screen.getByRole('button', { name: /compare/i })
    expect(button).toBeDisabled()

    await userEvent.upload(screen.getByLabelText(/recording a/i), control)
    expect(button).toBeDisabled()

    await userEvent.upload(screen.getByLabelText(/recording b/i), treated)
    expect(button).toBeEnabled()
  })

  it('sends recording A then B and renders a side-by-side comparison', async () => {
    const compare = vi.fn<ApiClient['compare']>().mockResolvedValue({ result: compareMock.result, warnings: [], durations: null, intervals: null })
    render(<CompareView api={fakeApi(compare)} />)

    await userEvent.upload(screen.getByLabelText(/recording a/i), control)
    await userEvent.upload(screen.getByLabelText(/recording b/i), treated)
    await userEvent.click(screen.getByRole('button', { name: /compare/i }))

    expect(compare).toHaveBeenCalledWith(control, treated)
    const table = await screen.findByRole('table', { name: /behavior frequency comparison/i })
    const attackRow = within(table).getByRole('row', { name: /attack/i })
    expect(within(attackRow).getByText('0.05')).toBeInTheDocument()
    expect(within(attackRow).getByText('0.20')).toBeInTheDocument()
    expect(within(attackRow).getByText('+0.15')).toBeInTheDocument()
    const investigationRow = within(table).getByRole('row', { name: /investigation/i })
    expect(within(investigationRow).getByText('-0.05')).toBeInTheDocument()
  })

  it('shows the error when comparison fails', async () => {
    const compare = vi.fn<ApiClient['compare']>().mockRejectedValue(new Error('Inference job j timed out'))
    render(<CompareView api={fakeApi(compare)} />)

    await userEvent.upload(screen.getByLabelText(/recording a/i), control)
    await userEvent.upload(screen.getByLabelText(/recording b/i), treated)
    await userEvent.click(screen.getByRole('button', { name: /compare/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('timed out')
  })

  it('switches between Summary and Detail without calling the backend again', async () => {
    const compare = vi.fn<ApiClient['compare']>().mockResolvedValue({ result: compareMock.result, warnings: [], durations: null, intervals: null })
    const { rerender } = render(<CompareView api={fakeApi(compare)} mode="summary" />)
    await userEvent.upload(screen.getByLabelText(/recording a/i), control)
    await userEvent.upload(screen.getByLabelText(/recording b/i), treated)
    await userEvent.click(screen.getByRole('button', { name: /compare/i }))
    expect(await screen.findByRole('region', { name: /summary of two-recording comparison/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /attacking rose from 5% to 20% of the time/i })).toBeInTheDocument()

    rerender(<CompareView api={fakeApi(compare)} mode="detail" />)
    expect(screen.getByRole('table', { name: /behavior frequency comparison/i })).toBeInTheDocument()
    expect(compare).toHaveBeenCalledTimes(1)
  })

  it('shows both recording lengths and a caution when they differ a lot', async () => {
    const compare = vi
      .fn<ApiClient['compare']>()
      .mockResolvedValue({ result: compareMock.result, warnings: ['Recording A: Short recording (5.0 s)'], durations: { control: 5, treated: 200 }, intervals: null })
    render(<CompareView api={fakeApi(compare)} />)
    await userEvent.upload(screen.getByLabelText(/recording a/i), control)
    await userEvent.upload(screen.getByLabelText(/recording b/i), treated)
    await userEvent.click(screen.getByRole('button', { name: /compare/i }))

    expect(await screen.findByText(/Recording A: 5 s · Recording B: 3 min 20 s/)).toBeInTheDocument()
    const notes = screen.getByLabelText(/notes about this recording/i)
    expect(notes).toHaveTextContent(/under 10 s/)
    expect(notes).toHaveTextContent(/40× longer/)
    expect(notes).toHaveTextContent(/Short recording \(5\.0 s\)/)
  })

  it('does not caution about comparable recordings', async () => {
    const compare = vi
      .fn<ApiClient['compare']>()
      .mockResolvedValue({ result: compareMock.result, warnings: [], durations: { control: 60, treated: 90 }, intervals: null })
    render(<CompareView api={fakeApi(compare)} />)
    await userEvent.upload(screen.getByLabelText(/recording a/i), control)
    await userEvent.upload(screen.getByLabelText(/recording b/i), treated)
    await userEvent.click(screen.getByRole('button', { name: /compare/i }))
    expect(await screen.findByText(/Recording A: 1 min · Recording B: 1 min 30 s/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/notes about this recording/i)).not.toBeInTheDocument()
  })

  it('blocks a pair that is too big together even though each file is under the limit', async () => {
    const compare = vi.fn<ApiClient['compare']>()
    render(<CompareView api={fakeApi(compare)} />)
    const big = (name: string) => {
      const f = new File(['x'], name, { type: 'application/json' })
      Object.defineProperty(f, 'size', { value: 3 * 1024 * 1024 })
      return f
    }
    await userEvent.upload(screen.getByLabelText(/recording a/i), big('a.json'))
    await userEvent.upload(screen.getByLabelText(/recording b/i), big('b.json'))
    expect(screen.getByRole('alert')).toHaveTextContent(/Together these files/)
    expect(screen.getByRole('button', { name: /compare/i })).toBeDisabled()
    expect(compare).not.toHaveBeenCalled()
  })

  it('notes when the same file is chosen for both recordings', async () => {
    render(<CompareView api={fakeApi(vi.fn())} />)
    await userEvent.upload(screen.getByLabelText(/recording a/i), control)
    await userEvent.upload(screen.getByLabelText(/recording b/i), control)
    expect(screen.getByText(/same file/i)).toBeInTheDocument()
  })
})
