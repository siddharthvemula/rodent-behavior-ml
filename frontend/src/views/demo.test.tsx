import { afterEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { demoClips } from '../lib/demoData'
import { buildDemoScript } from '../lib/demoScript'
import { doseResponse } from '../lib/doseResponse'
import { modelMetrics } from '../lib/modelMetrics'

const script = buildDemoScript({ clips: demoClips, metrics: modelMetrics, stats: doseResponse })

afterEach(() => window.history.replaceState(null, '', '/'))

/** Opens the app on a #demo=N link and waits for the demo's data to load (it is a lazy chunk). */
async function openAt(step: number) {
  window.history.replaceState(null, '', `/#demo=${step}`)
  const view = render(<App mockMode />)
  await waitFor(() => expect(document.querySelector('[data-demo-card]')).not.toBeNull())
  return view
}

const card = () => document.querySelector('[data-demo-card]') as HTMLElement | null
const target = (key: string) => document.querySelector(`[data-demo="${key}"]`)

describe('guided demo', () => {
  it('is off by default and starts from the header button', async () => {
    render(<App mockMode />)
    expect(screen.queryByRole('region', { name: /guided demo navigation/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /guided demo/i }))
    expect(await screen.findByRole('region', { name: /guided demo navigation/i })).toBeVisible()   // after its data loads
    expect(card()).toHaveAttribute('data-demo-card', 'intro')
    expect(window.location.hash).toBe('#demo=1')
  })

  it('opens directly on the step a #demo=N link names', async () => {
    await openAt(4)
    expect(card()).toHaveAttribute('data-demo-card', 'agreement')
    expect(screen.getByText(/step 4 of 8/i)).toBeInTheDocument()
  })

  it('every on-page step finds the element it highlights, on the right tab', async () => {
    const { unmount } = await openAt(1)
    for (const [i, s] of script.entries()) {
      if (i > 0) await userEvent.keyboard('{ArrowRight}')
      expect(card(), s.id).toHaveAttribute('data-demo-card', s.id)
      expect(screen.getByRole('tab', { name: new RegExp({ timeline: 'timeline', compare: 'compare', pharmacology: 'pharmacology' }[s.tab], 'i') })).toHaveAttribute('aria-selected', 'true')
      if (s.target) await waitFor(() => expect(target(s.target!), `${s.id} → ${s.target}`).not.toBeNull(), { timeout: 3000 })
    }
    unmount()
  })

  it('skips the upload form: the views show the precomputed result straight away', async () => {
    await openAt(2)
    expect(screen.queryByLabelText(/keypoints file/i)).not.toBeInTheDocument()
    expect(target('timeline-summary')).not.toBeNull()
  })

  it('says plainly that the data is precomputed real output, not canned sample data', async () => {
    await openAt(2)
    const banner = screen.getByRole('note')
    expect(banner).toHaveTextContent(/precomputed real model output/i)
    expect(banner).toHaveTextContent(/held-out/i)
    expect(banner).not.toHaveTextContent(/canned/i)
  })

  it('shows the human annotations only with their CC BY attribution', async () => {
    await openAt(4)
    const panel = target('clip-agreement') as HTMLElement
    expect(within(panel).getByRole('link', { name: /CC BY 4\.0/ })).toHaveAttribute('href', demoClips.attribution.license_url)
    expect(within(panel).getByRole('link', { name: /CalMS21/ })).toHaveAttribute('href', demoClips.attribution.url)
    expect(panel).toHaveTextContent(/Sun et al\. \(2021\)/)
    expect(panel).toHaveTextContent(/not part of the dataset/)
  })

  it('does not render the annotations on any other step', async () => {
    const { unmount } = await openAt(1)
    for (const [i, s] of script.entries()) {
      if (i > 0) await userEvent.keyboard('{ArrowRight}')
      expect(target('clip-agreement') !== null, s.id).toBe(s.showAgreement)
    }
    unmount()
  })

  it('calls the compared recordings Clip A and Clip B', async () => {
    await openAt(5)
    const panel = target('compare-result') as HTMLElement
    expect(panel).toHaveTextContent('Clip A')
    expect(panel).toHaveTextContent('Clip B')
    expect(panel).not.toHaveTextContent(/recording [ab]/i)
  })

  it('steps with the buttons and the keyboard, and leaves with Exit, Finish or Escape', async () => {
    await openAt(2)
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(card()).toHaveAttribute('data-demo-card', 'confidence')
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(card()).toHaveAttribute('data-demo-card', 'timeline')
    await userEvent.keyboard('{End}')
    expect(card()).toHaveAttribute('data-demo-card', 'close')
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
    await userEvent.keyboard('{Home}')
    expect(card()).toHaveAttribute('data-demo-card', 'intro')
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(card()).toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('hands control back as soon as the user clicks a tab or the view toggle, and the form comes back', async () => {
    await openAt(2)
    await userEvent.click(screen.getByRole('tab', { name: /compare recordings/i }))
    expect(card()).toBeNull()
    expect(screen.getByRole('tab', { name: /compare recordings/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText(/recording a keypoints/i)).toBeInTheDocument()
    expect(screen.getByText(/two arbitrary real CalMS21 recordings/i)).toBeInTheDocument()   // the stand-in note is back too

    window.history.replaceState(null, '', '/#demo=3')
    act(() => void window.dispatchEvent(new HashChangeEvent('hashchange')))
    await waitFor(() => expect(card()).not.toBeNull())
    await userEvent.click(within(screen.getByRole('group', { name: /results view/i })).getByRole('button', { name: 'Summary' }))
    expect(card()).toBeNull()
  })

  it('moves focus to each step’s heading so screen readers announce it', async () => {
    await openAt(2)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: script[1].title }))
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: script[2].title }))
  })

  it('hides and shows the notes (button and H key), and restores the app when left', async () => {
    await openAt(2)
    expect(card()).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Hide notes' }))
    expect(card()).not.toBeVisible()
    expect(document.documentElement.dataset.demoNotes).toBe('hidden')
    await userEvent.keyboard('h')
    expect(card()).toBeVisible()
    await userEvent.keyboard('{Escape}')
    expect(document.documentElement.dataset.demoNotes).toBeUndefined()
  })

  it('always shows a caveat with the step', async () => {
    const { unmount } = await openAt(1)
    for (const [i, s] of script.entries()) {
      if (i > 0) await userEvent.keyboard('{ArrowRight}')
      expect(card(), s.id).toHaveTextContent('Keep in mind:')
      expect(card(), s.id).toHaveTextContent(s.caveat)
    }
    unmount()
  })
})
