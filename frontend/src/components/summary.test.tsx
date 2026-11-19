import { fireEvent, render, screen, within } from '@testing-library/react'
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
    const rows = screen.getAllByRole('group').filter((g) => g.classList.contains('change__row'))
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Attack: recording A 0%, recording B 44%, 44 percentage points higher in recording B',
      'Investigation: recording A 61%, recording B 12%, 49 percentage points lower in recording B. Biggest change',
      'Mounting: recording A 18%, recording B 0%, 18 percentage points lower in recording B',
      'Other: recording A 21%, recording B 43%, 22 percentage points higher in recording B',
    ])
  })

  it('has a legend and a neutral difference for each behavior', () => {
    render(<CompareSummary result={compare} />)
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText('Recording A')).toBeInTheDocument()
    expect(within(legend).getByText('Recording B')).toBeInTheDocument()
    const deltas = [...document.querySelectorAll('.change__delta')].map((d) => d.textContent?.trim())
    expect(deltas).toContain('+44 pts')
    expect(deltas).toContain('−49 pts')
    expect(document.querySelector('.pair')).toBeNull() // the old paired bars are gone
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
    const rows = [...container.querySelectorAll<HTMLElement>('div.change__row')]
    expect(rows.map((r) => r.style.getPropertyValue('--beh'))).toEqual(['attack', 'investigation', 'mount', 'other'].map((l) => colors[l]))
  })
})

describe('TimelineSummary', () => {
  const tileValue = (label: string) => screen.getByText(label).closest('.tile')!.querySelector('.tile__value')

  it('shows a generated headline and exact figures', () => {
    render(<TimelineSummary segments={segments} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Mostly investigating: 60% of this 1 min 40 s recording' })).toBeInTheDocument()
    expect(tileValue('Recording length')).toHaveTextContent('1 min 40 s')
    expect(tileValue('Behavior segments')).toHaveTextContent('3')
    expect(tileValue('Average confidence')).toHaveTextContent('85%')
    expect(tileValue('Longest stretch')).toHaveTextContent('1 min')
  })

  it('adds a second sentence about how the lead behavior was spread out, like the comparison view', () => {
    render(<TimelineSummary segments={segments} />)
    expect(screen.getByText('Investigating happened in one continuous stretch of 1 min.')).toBeInTheDocument()
  })

  it('gives every stat tile an icon chip, and the longest-stretch tile its behavior color', () => {
    const { container } = render(<TimelineSummary segments={segments} />)
    const tiles = [...container.querySelectorAll<HTMLElement>('.tile')]
    expect(tiles).toHaveLength(4)
    for (const tile of tiles) expect(tile.querySelector('.chip svg')).not.toBeNull()
    expect(tiles[3].style.getPropertyValue('--beh')).toBe(buildColorMap(['investigation']).investigation)
    expect(tiles[0].style.getPropertyValue('--beh')).toBe('var(--text-muted)') // generic tiles stay neutral
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
    const standout = [...container.querySelectorAll('div.change__row.is-standout')]
    expect(standout).toHaveLength(1)
    expect(standout[0].getAttribute('aria-label')).toMatch(/^Investigation/)
    expect(within(standout[0] as HTMLElement).getByText('Biggest change')).toBeInTheDocument()
  })

  it('shows the headline number with a spoken equivalent', () => {
    render(<CompareSummary result={compare} />)
    expect(screen.getByText('49 percentage points lower in recording B')).toBeInTheDocument()
  })

  it('has no hero number when nothing meaningful changed', () => {
    const flat: CompareResult = { control: { attack: 0.1, other: 0.9 }, treated: { attack: 0.11, other: 0.89 }, difference: { attack: 0.01, other: -0.01 } }
    const { container } = render(<CompareSummary result={flat} />)
    expect(container.querySelector('.hero-stat')).toBeNull()
    expect(container.querySelector('.change__row.is-standout')).toBeNull()
  })

  it('draws a donut per recording with every value in its accessible name', () => {
    render(<CompareSummary result={compare} />)
    expect(screen.getByRole('img', { name: 'Recording A: Investigation 61%, Mounting 18%, Other 21%' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Recording B: Attack 44%, Investigation 12%, Other 43%' })).toBeInTheDocument()
  })

  it('centers each donut on the standout behavior until something is hovered', async () => {
    const { container } = render(<CompareSummary result={compare} />)
    const centers = () => [...container.querySelectorAll('.donut__center')].map((c) => c.textContent)
    expect(centers()).toEqual(['61%Investigation', '12%Investigation'])

    const attackRow = screen.getAllByRole('group').find((g) => g.classList.contains('change__row') && g.getAttribute('aria-label')?.startsWith('Attack'))!
    await userEvent.hover(attackRow)
    expect(centers()).toEqual(['0%Attack', '44%Attack']) // both donuts follow the hovered row
    expect(container.querySelectorAll('div.change__row.is-dim')).toHaveLength(3)
    expect(attackRow).toHaveClass('is-active')

    await userEvent.unhover(attackRow)
    expect(centers()).toEqual(['61%Investigation', '12%Investigation'])
    expect(container.querySelectorAll('.is-dim')).toHaveLength(0)
  })

  it('hovering a donut segment highlights the matching row', async () => {
    const { container } = render(<CompareSummary result={compare} />)
    const treatedAttackSeg = container.querySelectorAll('.donut')[1].querySelector<SVGCircleElement>('.donut__seg')!
    await userEvent.hover(treatedAttackSeg)
    const active = container.querySelector('div.change__row.is-active')
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

describe('interactive timeline (Summary) vs plain timeline (Detail)', () => {
  const segmentEls = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.timeline__segment')]
  const strip = (c: HTMLElement) => c.querySelector<HTMLElement>('.timeline--interactive')!

  /** jsdom has no layout, so give the strip a 1000 px width and move the pointer to a fraction of it. */
  function pointAt(container: HTMLElement, fraction: number) {
    const el = strip(container)
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 1000, bottom: 48, width: 1000, height: 48, x: 0, y: 0, toJSON: () => ({}) })
    // a MouseEvent named 'pointermove' carries clientX in jsdom (fireEvent.pointerMove does not)
    fireEvent(el, new MouseEvent('pointermove', { bubbles: true, clientX: fraction * 1000 }))
  }

  it('shows a readout with time range and confidence for the segment under the pointer, and clears it on leave', () => {
    const { container } = render(<TimelineSummary segments={segments} />)
    expect(screen.queryByText(/confident/)).not.toBeInTheDocument()
    pointAt(container, 0.7) // 60-80 s: the "other" segment
    expect(screen.getByText(/1:00\.0–1:20\.0/)).toBeInTheDocument()
    expect(screen.getByText(/50% confident/)).toBeInTheDocument()
    fireEvent.pointerLeave(strip(container))
    expect(screen.queryByText(/confident/)).not.toBeInTheDocument()
  })

  it('highlights the behavior under the pointer everywhere: its segments, its row, and the donut', () => {
    const { container } = render(<TimelineSummary segments={segments} />)
    pointAt(container, 0.9) // the mount segment
    expect(segmentEls(container)[2]).toHaveClass('is-active')
    expect(segmentEls(container)[0]).toHaveClass('is-dim')
    expect(container.querySelector('li.pair.is-active')?.getAttribute('aria-label')).toMatch(/^Mounting/)
    expect(container.querySelector('.donut__center')?.textContent).toBe('20%Mounting')
  })

  it('can land on a very thin segment that is only a couple of pixels wide', () => {
    const thin: BehaviorSegment[] = [
      { start_time: 0, end_time: 59.5, behavior_label: 'investigation', confidence: 0.9 },
      { start_time: 59.5, end_time: 60, behavior_label: 'mount', confidence: 0.8 }, // 0.5% of the strip = 5 px
      { start_time: 60, end_time: 100, behavior_label: 'other', confidence: 0.9 },
    ]
    const { container } = render(<TimelineSummary segments={thin} />)
    const readout = () => container.querySelector('.tip--ribbon')?.textContent
    pointAt(container, 0.592) // 3 px left of the thin segment: its hit zone reaches it
    expect(readout()).toContain('0:59.5–1:00.0')
    pointAt(container, 0.5) // well away from it: the wide neighbor, not the thin one
    expect(readout()).toContain('0:00.0–0:59.5')
    expect(readout()).not.toContain('1:00.0')
  })

  it('labels the axis at five points', () => {
    const { container } = render(<TimelineSummary segments={segments} />)
    expect([...container.querySelectorAll('.timeline__axis--ticks span')].map((e) => e.textContent)).toEqual([
      '0:00.0', '0:25.0', '0:50.0', '1:15.0', '1:40.0',
    ])
  })

  it('the Detail ribbon stays plain: native tooltips, no hover state, two axis labels', async () => {
    const { container } = render(<BehaviorTimeline segments={segments} />)
    const els = segmentEls(container)
    expect(els[0]).toHaveAttribute('title')
    fireEvent(container.querySelector('.timeline')!, new MouseEvent('pointermove', { bubbles: true, clientX: 100 }))
    await userEvent.hover(els[0])
    expect(container.querySelector('.is-hover, .is-active, .is-dim, .tip')).toBeNull()
    expect(container.querySelector('.timeline--interactive, .timeline-wrap')).toBeNull()
    expect(container.querySelectorAll('.timeline__axis span')).toHaveLength(2)
  })
})
