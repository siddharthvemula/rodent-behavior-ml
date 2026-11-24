import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'

/** Everything a reader or a screen reader can see: text, plus the attributes that carry accessible names. */
function visibleStrings(root: HTMLElement): string[] {
  const out = [root.textContent ?? '']
  for (const el of root.querySelectorAll('[aria-label],[title],[alt],[placeholder],[aria-description]')) {
    for (const a of ['aria-label', 'title', 'alt', 'placeholder', 'aria-description']) {
      const v = el.getAttribute(a)
      if (v) out.push(v)
    }
  }
  return out
}

// The two recordings in the Compare view are "Recording A" / "Recording B" (and the guided demo's are "Clip A" /
// "Clip B"). Words that imply an experiment must never be shown. Internal names such as the API field names are not.
const TWO_GROUP_WORDS = /\bcontrol(s|led)?\b|\btreated\b/i

function expectNoTwoGroupWords(root: HTMLElement, where: string) {
  for (const s of visibleStrings(root)) {
    const m = s.match(TWO_GROUP_WORDS)
    expect(m, `${where}: "${m?.[0]}" in ...${s.slice(Math.max(0, (m?.index ?? 0) - 40), (m?.index ?? 0) + 60)}...`).toBeNull()
  }
}

describe('no two-group wording anywhere in the UI', () => {
  it('holds in every tab, both result views, and after real results render', async () => {
    const { container } = render(<App mockMode />)
    await screen.findByRole('heading', { name: /how each dose compares with saline/i, hidden: true })   // lazy Pharmacology tab
    expectNoTwoGroupWords(container, 'initial load (all three tabs are mounted)')

    const file = new File(['{}'], 'a.json', { type: 'application/json' })
    await userEvent.upload(screen.getByLabelText(/keypoints file/i), file)
    await userEvent.click(screen.getByRole('button', { name: /predict behaviors/i }))
    await waitFor(() => expect(screen.getAllByText(/attack|investigation/i).length).toBeGreaterThan(3), { timeout: 4000 })
    expectNoTwoGroupWords(container, 'timeline results, summary view')

    await userEvent.click(screen.getByRole('tab', { name: /compare recordings/i }))
    await userEvent.upload(screen.getByLabelText(/recording a/i), new File(['{}'], 'a.json', { type: 'application/json' }))
    await userEvent.upload(screen.getByLabelText(/recording b/i), new File(['{}'], 'b.json', { type: 'application/json' }))
    await userEvent.click(screen.getByRole('button', { name: /compare behaviors/i }))
    await waitFor(() => expect(screen.getAllByText(/recording b/i).length).toBeGreaterThan(2), { timeout: 4000 })
    expectNoTwoGroupWords(container, 'compare results, summary view')

    await userEvent.click(screen.getByRole('button', { name: 'Detail' }))
    await screen.findByRole('table', { name: /behavior frequency comparison/i })
    expectNoTwoGroupWords(container, 'compare results, detail view')

    await userEvent.click(screen.getByRole('tab', { name: /timeline/i }))
    expectNoTwoGroupWords(container, 'timeline results, detail view')
  })

  it('holds on every step of the guided demo, including the card text and the annotation panel', async () => {
    window.history.replaceState(null, '', '/#demo=1')
    const { container } = render(<App mockMode />)
    for (let step = 1; step <= 8; step++) {
      if (step > 1) await userEvent.keyboard('{ArrowRight}')
      await waitFor(() => expect(document.querySelector('[data-demo-card]')).not.toBeNull())   // the demo data is a lazy chunk
      expect(screen.getByText(new RegExp(`step ${step} of 8`, 'i'))).toBeInTheDocument()
      expectNoTwoGroupWords(container, `guided demo step ${step}`)
    }
    window.history.replaceState(null, '', '/')
  })

  it('catches the words it is meant to catch', () => {
    for (const bad of ['a stand-in for control and treatment', 'Treated recording', 'the control group', 'controls']) {
      expect(TWO_GROUP_WORDS.test(bad) || /treatment/.test(bad), bad).toBe(true)
    }
    expect(TWO_GROUP_WORDS.test('Recording A vs Recording B; does not measure a treatment effect')).toBe(false)
  })
})
