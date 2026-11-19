import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BehaviorSegment, CompareResult } from '../api/types'
import { BehaviorTimeline } from './BehaviorTimeline'
import { BoutStats } from './BoutStats'
import { ChangeChart } from './ChangeChart'
import { ComparisonChart } from './ComparisonChart'
import { CompareSummary } from './CompareSummary'
import { ConfidenceLane } from './ConfidenceLane'

const seg = (start: number, end: number, label: string, confidence: number): BehaviorSegment => ({
  start_time: start,
  end_time: end,
  behavior_label: label,
  confidence,
})
const segments = [seg(0, 10, 'other', 0.9), seg(10, 14, 'attack', 0.5), seg(14, 20, 'other', 0.8), seg(20, 22, 'attack', 0.95)]

const compare: CompareResult = {
  control: { attack: 0.05, investigation: 0.35, mount: 0.1, other: 0.5 },
  treated: { attack: 0.2, investigation: 0.3, mount: 0.05, other: 0.45 },
  difference: { attack: 0.15, investigation: -0.05, mount: -0.05, other: -0.05 },
}

describe('ConfidenceLane', () => {
  it('summarizes confidence in its accessible name', () => {
    render(<ConfidenceLane segments={segments} />)
    const lane = screen.getByRole('img', { name: /confidence over time/i })
    expect(lane).toHaveAccessibleName(/Average 8\d%/)
    expect(lane).toHaveAccessibleName(/1 segment is less certain/)
    expect(lane).toHaveAccessibleName(/Least certain: Attack at 0:10\.0, 50%/)
  })

  it('says so when nothing is uncertain', () => {
    render(<ConfidenceLane segments={[seg(0, 5, 'other', 0.9)]} />)
    expect(screen.getByText(/every segment is at 60% confidence or higher/i)).toBeInTheDocument()
  })

  it('renders nothing for no segments', () => {
    const { container } = render(<ConfidenceLane segments={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('BoutStats', () => {
  it('lists bouts, lengths and median confidence per behavior in canonical order', () => {
    render(<BoutStats segments={segments} />)
    const rows = within(screen.getByRole('table', { name: /bouts and confidence/i })).getAllByRole('row')
    expect(rows).toHaveLength(3) // header, attack, other
    const attack = within(rows[1]).getAllByRole('cell').map((c) => c.textContent)
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('Attack')
    expect(attack[0]).toBe('2') // bouts
    expect(attack[2]).toBe('3.0 s') // median bout of 4 s and 2 s
    expect(attack[3]).toBe('4.0 s') // longest
    expect(attack[5]).toBe('73%') // median of 0.5 and 0.95 = 0.725
    expect(rows[1].querySelector('[aria-label*="1 of 2 bouts below 60%"]')).not.toBeNull()
  })
})

describe('ChangeChart', () => {
  it('has one row per behavior, biggest change first, with exact values in the accessible name', () => {
    render(<ChangeChart result={compare} />)
    const groups = screen.getAllByRole('group').filter((g) => g.tabIndex === 0)
    expect(groups[0]).toHaveAccessibleName('Attack: recording A 5%, recording B 20%, 15 percentage points higher in recording B. Biggest change')
    expect(groups[1]).toHaveAccessibleName('Investigation: recording A 35%, recording B 30%, 5 percentage points lower in recording B')
    expect(groups).toHaveLength(4)
  })

  it('says "no difference" when A equals B', () => {
    const same: CompareResult = { control: { attack: 0.2 }, treated: { attack: 0.2 }, difference: { attack: 0 } }
    render(<ChangeChart result={same} />)
    expect(screen.getByLabelText(/Attack: recording A 20%, recording B 20%, no difference/)).toBeInTheDocument()
  })

  it('renders nothing when there are no behaviors', () => {
    const { container } = render(<ChangeChart result={{ control: {}, treated: {}, difference: {} }} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('placement', () => {
  it('Detail timeline shows the lane and breakdown; Summary compare and Detail compare both show the change chart', () => {
    const { unmount } = render(<BehaviorTimeline segments={segments} />)
    expect(screen.getByRole('img', { name: /confidence over time/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /per-behavior breakdown/i })).toBeInTheDocument()
    unmount()

    const detail = render(<ComparisonChart result={compare} />)
    expect(screen.getByRole('figure', { name: /change from recording a/i })).toBeInTheDocument()
    detail.unmount()

    render(<CompareSummary result={compare} />)
    expect(screen.getByRole('figure', { name: /change from recording a/i })).toBeInTheDocument()
  })
})
