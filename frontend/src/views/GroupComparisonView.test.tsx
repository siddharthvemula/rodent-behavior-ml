import { describe, expect, it } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import statsRaw from '../data/group_comparison.json'
import { GroupComparisonView } from './GroupComparisonView'
import { groupComparison, parseGroupComparison } from '../lib/groupComparison'
import App from '../App'

describe('GroupComparisonView caveats (must ship in the UI)', () => {
  it('says the stress group is foot-shock stress per a dataset contributor, not inferred from session naming', () => {
    const { container } = render(<GroupComparisonView />)
    const caveats = within(screen.getByTestId('caveats'))
      .getByText(/what “stress” means/i)
      .closest('li')!
    expect(caveats.textContent).toMatch(/foot-shock stress, per a dataset contributor/i)
    expect(container.textContent).not.toMatch(/session nam/i)
  })

  it('states that the naive group is small and limits power, with n and the minimum detectable effect from the data', () => {
    render(<GroupComparisonView />)
    const li = within(screen.getByTestId('caveats'))
      .getByText(/the naive group is small/i)
      .closest('li')!
    expect(li.textContent).toContain(`Naive n = ${groupComparison.design.groups.naive}`)
    expect(li.textContent).toMatch(/limits\s+power/)
    expect(li.textContent).toContain(`d ≈ ${groupComparison.power.single_test.mde_d!.toFixed(1)}`)
    expect(li.textContent).toMatch(/does not show there is no difference/)
  })

  it('states this is an observed group difference, not a validated causal treatment effect', () => {
    render(<GroupComparisonView />)
    const li = within(screen.getByTestId('caveats'))
      .getByText(/observed group difference, not a treatment effect/i)
      .closest('li')!
    expect(li.textContent).toMatch(/documents no randomization/)
    expect(li.textContent).toMatch(/not a validated causal effect/)
  })

  it('states that recordings may not be independent', () => {
    render(<GroupComparisonView />)
    const li = within(screen.getByTestId('caveats'))
      .getByText(/recordings may not be fully independent/i)
      .closest('li')!
    expect(li.textContent).toMatch(/p-values here are too\s+optimistic/)
  })

  it('keeps the caveats collapsed by default, one click away, right under the headline result', async () => {
    render(<GroupComparisonView />)
    const method = screen.getByTestId('methodology') as HTMLDetailsElement
    expect(method).toContainElement(screen.getByTestId('caveats'))
    expect(method.open).toBe(false)
    expect(screen.getByTestId('caveats')).not.toBeVisible()
    const charts = screen.getByRole('heading', { name: /how each group compares with naive/i })
    expect(screen.getByTestId('family-outcome').compareDocumentPosition(method) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(method.compareDocumentPosition(charts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(within(method).getByText('Methodology and caveats'))
    expect(screen.getByTestId('caveats')).toBeVisible()
  })

  it('says next to the headline that a null result does not show the groups are the same', () => {
    render(<GroupComparisonView />)
    expect(screen.getByTestId('family-outcome').textContent).toMatch(/does not show the groups are the same/)
  })
})

describe('GroupComparisonView', () => {
  it('shows every recording as a dot: 12 metrics x 50 recordings', () => {
    render(<GroupComparisonView />)
    expect(screen.getAllByTestId('recording-dot')).toHaveLength(12 * 50)
    expect(screen.getAllByText('n = 8')).toHaveLength(12)
  })

  it('lays out the 36 planned comparisons as labelled rows, with a marker that matches significance', () => {
    render(<GroupComparisonView />)
    const rows = screen.getAllByTestId('group-forest-row')
    expect(rows).toHaveLength(36)
    for (const r of rows) {
      expect(r.querySelector('[data-marker]')?.getAttribute('data-marker')).toBe(
        r.getAttribute('data-significant') === 'true' ? 'filled' : 'hollow',
      )
    }
  })

  it('reports the family outcome from the statistics, and warns that raw-p hits are chance-level', () => {
    render(<GroupComparisonView />)
    const text = screen.getByTestId('family-outcome').textContent ?? ''
    expect(text).toMatch(/None of the 36 planned comparisons with naive held up after correction/)
    expect(screen.getByTestId('raw-p-note').textContent).toMatch(/about 1\.8 would be expected by chance alone, so those are not findings/)
  })

  it('switches its headline when the data does show significant comparisons', () => {
    const d = JSON.parse(JSON.stringify(statsRaw))
    d.metrics.attack_time_pct.comparisons[0].p_holm = 0.01
    d.metrics.attack_time_pct.comparisons[0].p_perm = 0.0003
    render(<GroupComparisonView stats={parseGroupComparison(d)} />)
    expect(screen.getByTestId('family-outcome').textContent).toMatch(/1 of 36 planned comparisons remain significant/)
  })

  it('does not claim any behavior difference in prose that the table does not carry', () => {
    const { container } = render(<GroupComparisonView />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/not a validated causal effect/)
    expect(text).not.toMatch(/\b(causes?|caused|induces?|increases?) (attack|aggression)/i)
    expect(text).toMatch(/The behavior classifier is not used here/)
  })

  it('discloses the time-shift issue and why the sensitivity analysis is not shown', () => {
    const { container } = render(<GroupComparisonView />)
    const ts = groupComparison.time_shift
    expect(container.textContent).toContain(`${ts.videos_shifted_by_group.naive} of ${ts.videos_by_group.naive} naive`)
    expect(container.textContent).toMatch(/re-running without shifted recordings is not possible/)
  })

  it('shows the effect-size interval on focus, as on hover', async () => {
    render(<GroupComparisonView />)
    const row = screen.getAllByTestId('group-forest-row')[1].querySelector('rect') as SVGRectElement
    act(() => row.focus())
    expect(await screen.findByRole('status')).toHaveTextContent(/vs naive.*95% CI.*Holm p/)
    act(() => row.blur())
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('has table twins of the charts', async () => {
    render(<GroupComparisonView />)
    await userEvent.click(screen.getByText(/table of every comparison/i))
    expect(within(screen.getByRole('table', { name: /effect size, interval and p-values/i })).getAllByRole('row')).toHaveLength(37)
    await userEvent.click(screen.getByText(/^group summary table$/i))
    expect(within(screen.getByRole('table', { name: /per-group mean, median/i })).getAllByRole('row')).toHaveLength(49)
    await userEvent.click(screen.getByText(/exploratory: non-naive groups/i))
    expect(within(screen.getByRole('table', { name: /exploratory effect sizes/i })).getAllByRole('row')).toHaveLength(37)
  })

  it('attributes the dataset with its license and DOI', () => {
    render(<GroupComparisonView />)
    expect(screen.getAllByText(/CC-BY-NC-SA-4\.0/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /doi\.org\/10\.60533/ })).toBeInTheDocument()
  })
})

describe('Behavior groups tab', () => {
  it('is a separate tab that does not disturb the existing ones', async () => {
    render(<App mockMode />)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Timeline',
      'Compare recordings',
      'Pharmacology demo',
      'Behavior groups',
    ])
    expect(screen.queryByTestId('caveats')).not.toBeInTheDocument() // not mounted until first opened
    await userEvent.click(screen.getByRole('tab', { name: 'Behavior groups' }))
    expect(await screen.findByRole('heading', { name: /how each group compares with naive/i })).toBeVisible()
    expect(screen.queryByText(/canned sample data/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Timeline' }))
    expect(screen.getByTestId('caveats')).toBeInTheDocument() // stays mounted after the first visit
  })
})
