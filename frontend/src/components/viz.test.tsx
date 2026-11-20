import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BehaviorSegment, CompareIntervals, CompareResult } from '../api/types'
import { BehaviorTimeline } from './BehaviorTimeline'
import { BoutStats } from './BoutStats'
import { ChangeChart } from './ChangeChart'
import { ComparisonChart } from './ComparisonChart'
import { CompareSummary } from './CompareSummary'
import { ConfidenceLane } from './ConfidenceLane'
import { ModelTrust } from './ModelTrust'

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

describe('bootstrap ranges', () => {
  const intervals: CompareIntervals = {
    level: 0.95,
    control: { attack: [0, 0.12], investigation: [0.22, 0.48], mount: [0.03, 0.19], other: [0.38, 0.62] },
    treated: { attack: [0.09, 0.33], investigation: [0.18, 0.43], mount: [0, 0.12], other: [0.33, 0.57] },
    difference: { attack: [0.02, 0.28], investigation: [-0.24, 0.14], mount: [-0.17, 0.06], other: [-0.24, 0.13] },
  }

  it('marks differences beyond noise vs within noise, in the accessible name too', () => {
    render(<ChangeChart result={compare} intervals={intervals} />)
    expect(screen.getByLabelText(/^Attack:.*95% range for the difference \+2 to \+28 pts, beyond noise/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Investigation:.*−24 to \+14 pts, within noise/)).toBeInTheDocument()
    expect(document.querySelectorAll('.change__whisker')).toHaveLength(8)
  })

  it('is honest that the ranges do not show two groups differ', () => {
    render(<ChangeChart result={compare} intervals={intervals} />)
    expect(screen.getByText(/does not show that two animals or groups differ/i)).toBeInTheDocument()
  })

  it('draws nothing extra without intervals', () => {
    render(<ChangeChart result={compare} />)
    expect(document.querySelector('.change__whisker, .change__verdict, .change__note')).toBeNull()
  })

  it('adds a range column to the Detail table', () => {
    render(<ComparisonChart result={compare} intervals={intervals} />)
    expect(screen.getByRole('columnheader', { name: '95% range of difference' })).toBeInTheDocument()
    expect(screen.getByText('+2 to +28 pts')).toBeInTheDocument()
  })
})

describe('ModelTrust', () => {
  it('is collapsed by default but states the headline in its summary', () => {
    render(<ModelTrust />)
    expect(screen.getByText(/tested on 19 recordings the model never saw/i)).toBeInTheDocument()
    expect(document.querySelector('details')).not.toHaveAttribute('open')
  })

  it('shows F1 and time-share error for every behavior and a 4x4 confusion matrix', () => {
    render(<ModelTrust />)
    const rows = within(screen.getByRole('region', { name: /score and time-share error/i })).getAllByRole('row')
    expect(rows).toHaveLength(5)
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent('Attack')
    expect(rows[1].textContent).toMatch(/0\.83/)
    const matrix = screen.getByRole('table', { name: /confusion matrix/i })
    expect(within(matrix).getAllByRole('row')).toHaveLength(6) // 2 header rows + 4
    // attack row: 11098 of 12630 frames were called attack
    expect(within(matrix).getAllByRole('row')[2]).toHaveTextContent('88%')
  })

  it('calls out the highlighted behavior and admits its limits', () => {
    render(<ModelTrust highlight="attack" />)
    expect(screen.getByText(/this result is about/i)).toHaveTextContent(/attack\. The model scored 0\.83/)
    expect(screen.getByText(/one lab's setup/i)).toBeInTheDocument()
  })

  it('appears in both Detail views', () => {
    const t = render(<BehaviorTimeline segments={segments} />)
    expect(screen.getByText('How much to trust this')).toBeInTheDocument()
    t.unmount()
    render(<ComparisonChart result={compare} />)
    expect(screen.getByText(/this result is about/i)).toHaveTextContent(/attack/i)
  })
})
