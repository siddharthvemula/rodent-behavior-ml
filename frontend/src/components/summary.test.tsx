import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BehaviorSegment, CompareResult } from '../api/types'
import { buildColorMap } from '../lib/behaviors'
import { BehaviorTimeline } from './BehaviorTimeline'
import { CompareSummary } from './CompareSummary'
import { TimelineSummary } from './TimelineSummary'
import { ViewToggle } from './ViewToggle'

const compare: CompareResult = {
  control: { attack: 0, investigation: 0.61, mount: 0.18, other: 0.21 },
  treated: { attack: 0.44, investigation: 0.12, mount: 0, other: 0.43 },
  difference: { attack: 0.44, investigation: -0.49, mount: -0.18, other: 0.22 },
}

const segments: BehaviorSegment[] = [
  { start_time: 0, end_time: 60, behavior_label: 'investigation', confidence: 0.95 },
  { start_time: 60, end_time: 80, behavior_label: 'other', confidence: 0.5 },
  { start_time: 80, end_time: 100, behavior_label: 'mount', confidence: 0.9 },
]

describe('CompareSummary', () => {
  it('shows a headline generated from the result, as the accessible heading', () => {
    render(<CompareSummary result={compare} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Investigating fell sharply from 61% to 12% of the time' })).toBeInTheDocument()
    expect(screen.getByText(/also: attacking jumped from 0% to 44%/i)).toBeInTheDocument()
  })

  it('headline follows the data', () => {
    const attackHeavy: CompareResult = { control: { attack: 0.1, other: 0.9 }, treated: { attack: 0.5, other: 0.5 }, difference: { attack: 0.4, other: -0.4 } }
    render(<CompareSummary result={attackHeavy} />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveAccessibleName('Attacking jumped from 10% to 50% of the time')
  })

  it('lists every behavior in the fixed order with exact values in its accessible name', () => {
    render(<CompareSummary result={compare} />)
    const rows = screen.getAllByRole('listitem').filter((li) => li.classList.contains('pair'))
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Attack: control 0%, treated 44%, 44 percentage points higher in treated',
      'Investigation: control 61%, treated 12%, 49 percentage points lower in treated. Biggest change',
      'Mounting: control 18%, treated 0%, 18 percentage points lower in treated',
      'Other: control 21%, treated 43%, 22 percentage points higher in treated',
    ])
  })

  it('has a legend and a neutral difference for each behavior', () => {
    render(<CompareSummary result={compare} />)
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText('Control')).toBeInTheDocument()
    expect(within(legend).getByText('Treated')).toBeInTheDocument()
    expect(screen.getByText('+44 pts')).toBeInTheDocument()
    expect(screen.getByText('−49 pts')).toBeInTheDocument()
  })

  it('is honest about what the numbers are', () => {
    render(<CompareSummary result={compare} />)
    expect(screen.getByText(/not a statistical test/i)).toBeInTheDocument()
  })

  it('offers a way to the exact values only when a handler is given', async () => {
    const onShowDetail = vi.fn()
    const { rerender } = render(<CompareSummary result={compare} />)
    expect(screen.queryByRole('button', { name: /detail view/i })).not.toBeInTheDocument()
    rerender(<CompareSummary result={compare} onShowDetail={onShowDetail} />)
    await userEvent.click(screen.getByRole('button', { name: /detail view/i }))
    expect(onShowDetail).toHaveBeenCalledOnce()
  })

  it('says when there is nothing to compare and when nothing changed', () => {
    const { unmount } = render(<CompareSummary result={{ control: {}, treated: {}, difference: {} }} />)
    expect(screen.getByText(/no behaviors detected/i)).toBeInTheDocument()
    unmount()
    render(<CompareSummary result={{ control: { attack: 0.1, other: 0.9 }, treated: { attack: 0.11, other: 0.89 }, difference: { attack: 0.01, other: -0.01 } }} />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveAccessibleName(/about the same/i)
  })

  it('every behavior row carries its fixed color', () => {
    const { container } = render(<CompareSummary result={compare} />)
    const colors = buildColorMap(Object.keys(compare.control))
    const rows = [...container.querySelectorAll<HTMLElement>('li.pair')]
    expect(rows.map((r) => r.style.getPropertyValue('--beh'))).toEqual(['attack', 'investigation', 'mount', 'other'].map((l) => colors[l]))
  })
})

describe('TimelineSummary', () => {
  it('shows a generated headline and exact figures', () => {
    render(<TimelineSummary segments={segments} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Mostly investigating: 60% of this 1 min 40 s recording' })).toBeInTheDocument()
    expect(screen.getByText('Recording length').nextElementSibling).toHaveTextContent('1 min 40 s')
    expect(screen.getByText('Behavior segments').nextElementSibling).toHaveTextContent('3')
    expect(screen.getByText('Average confidence').nextElementSibling).toHaveTextContent('85%')
    expect(screen.getByText('Longest stretch').nextElementSibling).toHaveTextContent('1 min')
  })

  it('lists behaviors by share with exact seconds', () => {
    render(<TimelineSummary segments={segments} />)
    const rows = screen.getAllByRole('listitem').filter((li) => li.classList.contains('pair'))
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Investigation: 60% of the recording, 60.0 seconds. Most time',
      'Other: 20% of the recording, 20.0 seconds',
      'Mounting: 20% of the recording, 20.0 seconds',
    ])
  })

  it('renders the colored timeline too', () => {
    render(<TimelineSummary segments={segments} />)
    expect(screen.getByRole('img', { name: /behavior timeline/i })).toBeInTheDocument()
  })

  it('handles an empty recording', () => {
    render(<TimelineSummary segments={[]} />)
    expect(screen.getByText(/no behaviors detected/i)).toBeInTheDocument()
  })
})

describe('one color per behavior across Summary and Detail', () => {
  it('uses identical colors for the same behaviors in both views', () => {
    const summary = render(<TimelineSummary segments={segments} />)
    const summaryColors = new Map(
      [...summary.container.querySelectorAll<HTMLElement>('li.pair')].map((li, i) => [
        ['investigation', 'other', 'mount'][i],
        li.style.getPropertyValue('--beh'),
      ]),
    )
    summary.unmount()

    const detail = render(<BehaviorTimeline segments={segments} />)
    const table = screen.getByRole('table', { name: /predicted segments/i })
    for (const row of within(table).getAllByRole('row').slice(1)) {
      const label = within(row).getAllByRole('cell')[2].textContent!.trim()
      const swatch = row.querySelector<HTMLElement>('.swatch')!
      expect(swatch.style.background).toBe(summaryColors.get(label))
    }
    detail.unmount()
  })

  it('never reuses a color between two behaviors', () => {
    const colors = Object.values(buildColorMap(['attack', 'investigation', 'mount', 'other']))
    expect(new Set(colors).size).toBe(4)
  })
})

describe('ViewToggle', () => {
  it('marks the active option and reports changes', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<ViewToggle mode="summary" onChange={onChange} />)
    const group = screen.getByRole('group', { name: /results view/i })
    expect(within(group).getByRole('button', { name: 'Summary' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'Detail' })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(within(group).getByRole('button', { name: 'Detail' }))
    expect(onChange).toHaveBeenCalledWith('detail')

    rerender(<ViewToggle mode="detail" onChange={onChange} />)
    expect(within(group).getByRole('button', { name: 'Detail' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('standout, donuts and linked hover', () => {
  it('flags the headline behavior as the standout and no other', () => {
    const { container } = render(<CompareSummary result={compare} />)
    const standout = [...container.querySelectorAll('li.pair--standout')]
    expect(standout).toHaveLength(1)
    expect(standout[0].getAttribute('aria-label')).toMatch(/^Investigation/)
    expect(within(standout[0] as HTMLElement).getByText('Biggest change')).toBeInTheDocument()
  })

  it('shows the headline number with a spoken equivalent', () => {
    render(<CompareSummary result={compare} />)
    expect(screen.getByText('49 percentage points lower in the treated recording')).toBeInTheDocument()
  })

  it('has no hero number when nothing meaningful changed', () => {
    const flat: CompareResult = { control: { attack: 0.1, other: 0.9 }, treated: { attack: 0.11, other: 0.89 }, difference: { attack: 0.01, other: -0.01 } }
    const { container } = render(<CompareSummary result={flat} />)
    expect(container.querySelector('.hero-stat')).toBeNull()
    expect(container.querySelector('.pair--standout')).toBeNull()
  })

  it('draws a donut per recording with every value in its accessible name', () => {
    render(<CompareSummary result={compare} />)
    expect(screen.getByRole('img', { name: 'Control: Investigation 61%, Mounting 18%, Other 21%' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Treated: Attack 44%, Investigation 12%, Other 43%' })).toBeInTheDocument()
  })

  it('centers each donut on the standout behavior until something is hovered', async () => {
    const { container } = render(<CompareSummary result={compare} />)
    const centers = () => [...container.querySelectorAll('.donut__center')].map((c) => c.textContent)
    expect(centers()).toEqual(['61%Investigation', '12%Investigation'])

    const attackRow = screen.getAllByRole('listitem').find((li) => li.getAttribute('aria-label')?.startsWith('Attack'))!
    await userEvent.hover(attackRow)
    expect(centers()).toEqual(['0%Attack', '44%Attack']) // both donuts follow the hovered row
    expect(container.querySelectorAll('li.pair.is-dim')).toHaveLength(3)
    expect(attackRow).toHaveClass('is-active')

    await userEvent.unhover(attackRow)
    expect(centers()).toEqual(['61%Investigation', '12%Investigation'])
    expect(container.querySelectorAll('.is-dim')).toHaveLength(0)
  })

  it('hovering a donut segment highlights the matching row', async () => {
    const { container } = render(<CompareSummary result={compare} />)
    const treatedAttackSeg = container.querySelectorAll('.donut')[1].querySelector<SVGCircleElement>('.donut__seg')!
    await userEvent.hover(treatedAttackSeg)
    const active = container.querySelector('li.pair.is-active')
    expect(active?.getAttribute('aria-label')).toMatch(/^Attack/)
  })

  it('single-recording Summary has a donut too, centered on the most common behavior', () => {
    const { container } = render(<TimelineSummary segments={segments} />)
    expect(screen.getByRole('img', { name: 'This recording: Investigation 60%, Other 20%, Mounting 20%' })).toBeInTheDocument()
    expect(container.querySelector('.donut__center')?.textContent).toBe('60%Investigation')
    expect(container.querySelectorAll('li.pair--standout')).toHaveLength(1)
    expect(screen.getByText('Most time')).toBeInTheDocument()
  })

  it('the ambient backdrop and hero stat exist only in the Summary, never in Detail', () => {
    const detail = render(<BehaviorTimeline segments={segments} />)
    expect(detail.container.querySelector('.summary, .hero, .hero-stat, .donut')).toBeNull()
  })
})
