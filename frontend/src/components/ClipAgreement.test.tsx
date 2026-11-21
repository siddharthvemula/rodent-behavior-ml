import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ClipAgreement } from './ClipAgreement'
import { clipById, disagreementSpans } from '../lib/demoClips'
import { demoClips } from '../lib/demoData'

describe('ClipAgreement', () => {
  const b = clipById(demoClips, 'clip_b')
  const a = clipById(demoClips, 'clip_a')

  it('draws the human annotation, the model prediction and where they disagree, as three lanes', () => {
    render(<ClipAgreement clip={b} attribution={demoClips.attribution} />)
    expect(screen.getByRole('img', { name: /^Human annotation: 64 segments/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Model prediction: 44 segments/ })).toBeInTheDocument()
    const diff = screen.getByRole('img', { name: /^Disagreement:/ })
    expect(diff.querySelectorAll('.agree__seg--diff')).toHaveLength(disagreementSpans(b).length)
  })

  it('reports agreement and per-behavior time and score; an absent behavior has no score, not a zero', () => {
    render(<ClipAgreement clip={b} attribution={demoClips.attribution} />)
    const table = screen.getByRole('table', { name: /Clip B: annotated and predicted time/ })
    const row = (name: RegExp) => within(table).getByRole('row', { name })
    expect(within(row(/^Attack/)).getByText('0.88')).toBeInTheDocument()
    expect(within(row(/^Investigation/)).getByText('0.56')).toBeInTheDocument()
    expect(within(row(/^Mounting/)).getByText('not in this clip')).toBeInTheDocument()
    expect(screen.getByText(/of frames agree/).textContent).toMatch(/86%/)
  })

  it('shows Clip A’s missing attack score as "not in this clip"', () => {
    render(<ClipAgreement clip={a} attribution={demoClips.attribution} />)
    expect(within(screen.getByRole('row', { name: /^Attack/ })).getByText('not in this clip')).toBeInTheDocument()
  })

  it('always carries the CalMS21 attribution, license and statement of changes', () => {
    render(<ClipAgreement clip={a} attribution={demoClips.attribution} />)
    expect(screen.getByRole('link', { name: /CC BY 4\.0/ })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/')
    expect(screen.getByRole('link', { name: /CalMS21 Task 1/ })).toHaveAttribute('href', demoClips.attribution.url)
    expect(screen.getByText(/run-length segments/)).toBeInTheDocument()
  })

  it('says the clip is held-out, and never uses two-group wording', () => {
    const { container } = render(<ClipAgreement clip={b} attribution={demoClips.attribution} />)
    expect(container.textContent).toMatch(/never used to train the model/)
    expect(container.textContent).not.toMatch(/control|treat/i)
  })
})
