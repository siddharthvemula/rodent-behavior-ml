import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PharmacologyView } from './PharmacologyView'
import App from '../App'

describe('PharmacologyView', () => {
  it('shows every mouse as a dot: 3 metrics x 4 groups x 8 mice', () => {
    render(<PharmacologyView />)
    expect(screen.getAllByTestId('mouse-dot')).toHaveLength(3 * 32)
  })

  it('labels units as pixels and never claims cm', () => {
    const { container } = render(<PharmacologyView />)
    expect(container.textContent).toMatch(/pixels/i)
    expect(container.textContent).not.toMatch(/\bcm\b(?!\.)/)
    expect(screen.getByText(/nothing here is converted to cm/i)).toBeInTheDocument()
  })

  it('states n and the no-significance caveat', () => {
    render(<PharmacologyView />)
    expect(screen.getAllByText('n = 8')).toHaveLength(12)
    expect(screen.getByText(/no significance test is run/i)).toBeInTheDocument()
  })

  it('includes the dataset attribution and license', () => {
    render(<PharmacologyView />)
    expect(screen.getByText(/10\.5281\/zenodo\.8188683/)).toBeInTheDocument()
    expect(screen.getAllByText(/CC BY 4\.0/).length).toBeGreaterThan(0)
  })

  it('has a per-mouse table alternative', async () => {
    render(<PharmacologyView />)
    await userEvent.click(screen.getByText(/per-mouse table/i))
    const table = screen.getByRole('table', { name: /per-mouse values/i })
    expect(within(table).getAllByRole('row')).toHaveLength(33)
  })
})

describe('Pharmacology tab', () => {
  it('is a separate tab that does not disturb the existing ones', async () => {
    render(<App mockMode />)
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toEqual(['Timeline', 'Compare recordings', 'Pharmacology demo'])
    await userEvent.click(screen.getByRole('tab', { name: 'Pharmacology demo' }))
    expect(screen.getByRole('heading', { name: /saline vs\. yohimbine/i })).toBeVisible()
    expect(screen.queryByText(/canned sample data/i)).not.toBeInTheDocument()
  })
})
