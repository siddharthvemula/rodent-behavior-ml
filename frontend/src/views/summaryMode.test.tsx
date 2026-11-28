import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { groupComparison } from '../lib/groupComparison'
import compareMock from '../mocks/compare.json'
import { CompareView } from './CompareView'
import { GroupComparisonView } from './GroupComparisonView'
import { PharmacologyView } from './PharmacologyView'

/** Words a Summary must never show, on screen or to a screen reader. */
const JARGON =
  /macro|\bmean\b|\bF1\b|holm|\bCIs?\b|\d+% (range|interval|CI)|hedges|effect[- ]size|\bg [−+-]?\d|\bp ?[=<]|p-values?|significan|permutation|bootstrap|interval|confidence|statistic|corrected|standard deviation|\bn ?=|beyond noise|within noise/i

const outcome = { result: compareMock.result, warnings: [], durations: { control: 100, treated: 100 }, intervals: compareMock.intervals as never }

const TABS = [
  { name: 'compare', view: (mode: 'summary' | 'detail') => <CompareView preloaded={outcome} mode={mode} /> },
  { name: 'pharmacology', view: (mode: 'summary' | 'detail') => <PharmacologyView mode={mode} /> },
  { name: 'behavior groups', view: (mode: 'summary' | 'detail') => <GroupComparisonView mode={mode} /> },
]

function spokenAndShown(root: HTMLElement): string[] {
  const attrs = [...root.querySelectorAll('[aria-label],[title]')].flatMap((e) => [e.getAttribute('aria-label'), e.getAttribute('title')])
  return [root.textContent ?? '', ...attrs.filter((a): a is string => !!a)]
}

/** Charts: the compare dumbbell and any donut, and the pharmacology / group SVG figures. */
const charts = (root: HTMLElement) => root.querySelectorAll('figure.change, figure.donut, figure.pharm-chart')

describe.each(TABS)('Summary mode: $name', ({ view }) => {
  it('has one headline number, one headline sentence and one chart', () => {
    const { container } = render(view('summary'))
    expect(container.querySelectorAll('.hero__headline')).toHaveLength(1)
    expect(container.querySelectorAll('.hero-stat')).toHaveLength(1)
    expect(container.querySelectorAll('.hero__context, .hero__extra')).toHaveLength(0)
    expect(charts(container)).toHaveLength(1)
    expect(container.querySelector('table, details')).toBeNull()
  })

  it('uses no statistical jargon, including in chart tooltips', async () => {
    const { container } = render(view('summary'))
    const check = () => {
      for (const s of spokenAndShown(container)) expect(s.match(JARGON)?.[0], s.slice(0, 200)).toBeUndefined()
    }
    check()
    for (const target of [...container.querySelectorAll('[tabindex="0"]')].slice(0, 4)) {
      await userEvent.hover(target)
      check()
    }
  })

  it('shows more charts in Detail', () => {
    const { container } = render(view('detail'))
    expect(charts(container).length).toBeGreaterThan(1)
  })
})

describe('the chart each Summary keeps', () => {
  it('pharmacology: the distance comparison, marked in words', () => {
    render(<PharmacologyView mode="summary" />)
    expect(screen.getAllByTestId('forest-row')).toHaveLength(3)
    expect(screen.getByRole('group', { name: /difference of each dose versus saline: distance traveled/i })).toBeInTheDocument()
    expect(screen.getAllByText('clear')).toHaveLength(2)
    expect(screen.getByText('not clear')).toBeInTheDocument()
  })

  it('behavior groups: time attacking, every recording of the four groups', () => {
    render(<GroupComparisonView mode="summary" />)
    expect(screen.getAllByTestId('recording-dot')).toHaveLength(50)
    expect(screen.queryByText(/rule out chance/i)).not.toBeInTheDocument() // the note under the chart says it, once
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/groups this small could miss a real one/)
  })

  it('behavior groups: says right under the chart that the visible gaps are not confirmed', () => {
    render(<GroupComparisonView mode="summary" />)
    const caveat = screen.getByTestId('chart-caveat')
    expect(caveat).toHaveTextContent('No gap here is a confirmed difference from naive mice, even if it looks large. See Detail for the full analysis.')
    expect(caveat.previousElementSibling).toBe(screen.getAllByTestId('recording-dot')[0].closest('figure'))
  })

  it('behavior groups: the note under the chart follows the data', () => {
    const stats = structuredClone(groupComparison)
    const mated = stats.metrics.attack_time_pct.comparisons.find((c) => c.group === 'mated')!
    Object.assign(mated, { p_holm: 0.01 })
    render(<GroupComparisonView mode="summary" stats={stats} />)
    expect(screen.getByTestId('chart-caveat')).toHaveTextContent('Only these are confirmed differences from naive mice: mated.')
  })
})
