import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimelineView } from './TimelineView'
import predictMock from '../mocks/predict.json'
import type { ApiClient } from '../api/client'

function fakeApi(predict: ApiClient['predict']): Pick<ApiClient, 'predict'> {
  return { predict }
}

const video = new File(['frames'], 'mouse-01.mp4', { type: 'video/mp4' })

describe('TimelineView', () => {
  it('keeps the run button disabled until a file is selected', async () => {
    render(<TimelineView api={fakeApi(vi.fn())} />)
    const button = screen.getByRole('button', { name: /predict behaviors/i })
    expect(button).toBeDisabled()

    const input = screen.getByLabelText<HTMLInputElement>(/video or keypoint file/i)
    await userEvent.upload(input, video)

    expect(button).toBeEnabled()
    expect(input.files?.[0]).toBe(video)
  })

  it('sends the selected file to predict and renders the timeline', async () => {
    const predict = vi.fn<ApiClient['predict']>().mockResolvedValue(predictMock.result)
    render(<TimelineView api={fakeApi(predict)} />)

    await userEvent.upload(screen.getByLabelText(/video or keypoint file/i), video)
    await userEvent.click(screen.getByRole('button', { name: /predict behaviors/i }))

    expect(predict).toHaveBeenCalledWith(video)
    const table = await screen.findByRole('table', { name: /predicted segments/i })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(4) // header + 3 segments
    expect(within(rows[1]).getByText('grooming')).toBeInTheDocument()
    expect(within(rows[1]).getByText('91%')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /behavior timeline/i })).toBeInTheDocument()
  })

  it('shows the backend error when prediction fails', async () => {
    const predict = vi.fn<ApiClient['predict']>().mockRejectedValue(new Error('Backend returned 500: boom'))
    render(<TimelineView api={fakeApi(predict)} />)

    await userEvent.upload(screen.getByLabelText(/video or keypoint file/i), video)
    await userEvent.click(screen.getByRole('button', { name: /predict behaviors/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Backend returned 500: boom')
  })

  it('shows an empty-state message when the model finds no behaviors', async () => {
    const predict = vi.fn<ApiClient['predict']>().mockResolvedValue([])
    render(<TimelineView api={fakeApi(predict)} />)

    await userEvent.upload(screen.getByLabelText(/video or keypoint file/i), video)
    await userEvent.click(screen.getByRole('button', { name: /predict behaviors/i }))

    expect(await screen.findByText(/no behaviors detected/i)).toBeInTheDocument()
  })
})
