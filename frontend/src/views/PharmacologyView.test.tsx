import { describe, expect, it } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PharmacologyView } from './PharmacologyView'
import App from '../App'

describe('PharmacologyView', () => {
  it('shows every mouse as a dot: 5 metrics x 4 groups x 8 mice', () => {
    render(<PharmacologyView />)
    expect(screen.getAllByTestId('mouse-dot')).toHaveLength(5 * 32)
  })

  it('labels units as pixels and never claims cm', () => {
    const { container } = render(<PharmacologyView />)
    expect(container.textContent).toMatch(/pixels/i)
    expect(container.textContent).not.toMatch(/\bcm\b(?!\.)/)
    expect(screen.getByText(/nothing here is converted to cm/i)).toBeInTheDocument()
  })

  it('states n and what the statistics can and cannot say', () => {
    const { container } = render(<PharmacologyView />)
    expect(screen.getAllByText('n = 8')).toHaveLength(5 * 4)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/no significance test is run/i)
    expect(text).toMatch(/does not show there is no effect/i)
    expect(text).toMatch(/these 32 mice only/i)
    expect(text).toMatch(/not show that yohimbine has any effect beyond them/i)
  })

  it('leads with the planned comparisons: 4 metrics x 3 doses, each a labelled row', () => {
    render(<PharmacologyView />)
    expect(screen.getByRole('heading', { name: /how each dose compares with saline/i })).toBeVisible()
    const rows = screen.getAllByTestId('forest-row')
    expect(rows).toHaveLength(12)
    expect(rows.filter((r) => r.getAttribute('data-significant') === 'true').length).toBeGreaterThan(0)
    expect(rows.filter((r) => r.getAttribute('data-significant') === 'false').length).toBeGreaterThan(0)
    for (const r of rows) {
      const marker = r.querySelector('[data-marker]')
      expect(marker?.getAttribute('data-marker')).toBe(r.getAttribute('data-significant') === 'true' ? 'filled' : 'hollow')
    }
  })

  it('writes one plain-language sentence per planned metric, built from the statistics', () => {
    render(<PharmacologyView />)
    const items = within(document.querySelector('.pharm-findings') as HTMLElement).getAllByRole('listitem')
    expect(items.map((i) => i.querySelector('strong')?.textContent)).toEqual([
      'Distance traveled.',
      'Time immobile.',
      'Time in center (all frames).',
      'Time in center (moving frames only).',
    ])
    for (const i of items) expect(i.textContent).toMatch(/Holm p|No dose clearly different/)
  })

  it('shows the effect-size interval on focus, as on hover', async () => {
    render(<PharmacologyView />)
    const row = screen.getAllByTestId('forest-row')[2].querySelector('rect') as SVGRectElement
    act(() => row.focus())
    expect(await screen.findByRole('status')).toHaveTextContent(/vs saline.*95% CI.*Holm p/)
    act(() => row.blur())
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('labels the time axis as assuming an inferred frame rate', () => {
    const { container } = render(<PharmacologyView />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/assumes 30 fps, inferred/)
    expect(text).toMatch(/not stated in the dataset/i)
    expect(screen.getAllByTestId('time-series')).toHaveLength(4)
    expect(screen.getAllByTestId('time-bin')).toHaveLength(6)
  })

  it('shows every dose group in a time-bin tooltip on keyboard focus', async () => {
    render(<PharmacologyView />)
    act(() => (screen.getAllByTestId('time-bin')[1] as unknown as SVGRectElement).focus())
    const tip = await screen.findByRole('status')
    for (const g of ['Saline', '1 mg/kg', '3 mg/kg', '6 mg/kg']) expect(tip).toHaveTextContent(g)
    expect(tip).toHaveTextContent(/95% CI/)
  })

  it('has table twins of both new charts', async () => {
    render(<PharmacologyView />)
    await userEvent.click(screen.getByText(/table of every comparison/i))
    expect(within(screen.getByRole('table', { name: /effect size, interval and p-values/i })).getAllByRole('row')).toHaveLength(13)
    await userEvent.click(screen.getByText(/^table of values$/i))
    expect(within(screen.getByRole('table', { name: /mean distance per time bin/i })).getAllByRole('row')).toHaveLength(7)
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
    expect(tabs).toEqual(['Timeline', 'Compare recordings', 'Pharmacology demo', 'Behavior groups'])
    await userEvent.click(screen.getByRole('tab', { name: 'Pharmacology demo' }))
    expect(screen.getByRole('heading', { name: /saline vs\. yohimbine/i })).toBeVisible()
    expect(screen.queryByText(/canned sample data/i)).not.toBeInTheDocument()
  })
})
