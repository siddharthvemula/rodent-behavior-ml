import type { ViewMode } from './useViewMode'

/**
 * The structure of the guided demo, with no data and no text: which tab and view each step needs, which clip the
 * timeline shows, what to highlight. It is deliberately tiny and imports nothing heavy, so the main bundle can drive
 * the app from it while the demo's data and wording are loaded only when the guide opens (see lib/demoBundle.ts).
 * That keeps a malformed data file from being able to take down the whole app, as with the lazy Pharmacology tab.
 */
export type DemoTab = 'timeline' | 'compare' | 'pharmacology'

export interface DemoFlowStep {
  readonly id: string
  /** 'interlude' has no target on the page: the card itself is the content. */
  readonly kind: 'screen' | 'interlude'
  readonly tab: DemoTab
  readonly view: ViewMode
  /** Which clip the Timeline tab shows (ignored on other tabs). */
  readonly clip: 'clip_a' | 'clip_b'
  /** Value of the `data-demo` attribute of the element to highlight, or null for an interlude. */
  readonly target: string | null
  /** Show the predicted-vs-annotated panel (it carries the CC BY attribution for the annotations). */
  readonly showAgreement: boolean
}

export const DEMO_FLOW: readonly DemoFlowStep[] = [
  { id: 'intro', kind: 'interlude', tab: 'timeline', view: 'summary', clip: 'clip_a', target: null, showAgreement: false },
  { id: 'timeline', kind: 'screen', tab: 'timeline', view: 'summary', clip: 'clip_a', target: 'timeline-summary', showAgreement: false },
  { id: 'confidence', kind: 'screen', tab: 'timeline', view: 'detail', clip: 'clip_a', target: 'confidence-lane', showAgreement: false },
  { id: 'agreement', kind: 'screen', tab: 'timeline', view: 'summary', clip: 'clip_b', target: 'clip-agreement', showAgreement: true },
  { id: 'compare', kind: 'screen', tab: 'compare', view: 'summary', clip: 'clip_a', target: 'compare-result', showAgreement: false },
  { id: 'trust', kind: 'screen', tab: 'timeline', view: 'detail', clip: 'clip_a', target: 'model-trust', showAgreement: false },
  { id: 'pharmacology', kind: 'screen', tab: 'pharmacology', view: 'summary', clip: 'clip_a', target: 'pharm-effects', showAgreement: false },
  { id: 'close', kind: 'interlude', tab: 'timeline', view: 'summary', clip: 'clip_a', target: null, showAgreement: false },
]
