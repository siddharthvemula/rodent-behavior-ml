import { lazy, Suspense, useState } from 'react'
import { apiConfig } from './api/client'
import { ClipAgreement } from './components/ClipAgreement'
import { DemoGuide } from './components/DemoGuide'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ViewToggle } from './components/ViewToggle'
import { DEMO_FLOW } from './lib/demoFlow'
import { useDemo } from './lib/useDemo'
import { useDemoBundle } from './lib/useDemoBundle'
import { useViewMode } from './lib/useViewMode'
import { CompareView } from './views/CompareView'
import { TimelineView } from './views/TimelineView'
import './App.css'
import './summary.css'
import './pharmacology.css'
import './viz.css'
import './demo.css'

// Loaded on demand so that, if its committed data file were ever malformed, only this tab fails
// (caught by its ErrorBoundary) instead of the import error taking down the whole app.
const PharmacologyView = lazy(() => import('./views/PharmacologyView').then((m) => ({ default: m.PharmacologyView })))

const GroupComparisonView = lazy(() => import('./views/GroupComparisonView').then((m) => ({ default: m.GroupComparisonView })))

const TABS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'compare', label: 'Compare recordings' },
  { id: 'pharmacology', label: 'Pharmacology demo' },
  { id: 'groups', label: 'Behavior groups' },
] as const

type TabId = (typeof TABS)[number]['id']

interface AppProps {
  /** Whether the API client is serving canned data; defaults to the real config. */
  readonly mockMode?: boolean
}

function App({ mockMode = apiConfig.useMock }: AppProps) {
  const [tab, setTab] = useState<TabId>('timeline')
  // The behavior-groups view is large (hundreds of chart dots), so it is mounted on first visit and then kept.
  const [groupsOpened, setGroupsOpened] = useState(false)
  const [userViewMode, setViewMode] = useViewMode('summary')

  // Guided demo: while a step is showing, it drives the tab and view mode and the views show precomputed results.
  // Any manual click on a tab or the view toggle hands control back to the user. The demo's data and wording are
  // loaded only when the guide opens (useDemoBundle), so a bad data file can never stop the app from starting; only
  // the light DEMO_FLOW skeleton (tabs, views, targets) is imported here.
  const demo = useDemo(DEMO_FLOW.length)
  const flow = demo.index === null ? null : DEMO_FLOW[demo.index]
  const loaded = useDemoBundle(flow !== null)
  const bundle = loaded.status === 'ready' ? loaded.bundle : null
  const step = flow && bundle ? bundle.script[demo.index!] : null
  const activeTab: TabId = flow ? flow.tab : tab
  const viewMode = flow ? flow.view : userViewMode
  const leaveDemoToDetail = () => {
    demo.exit()
    setViewMode('detail')
  }
  const demoClip = step && bundle ? bundle.clips.clips.find((c) => c.id === step.clip) ?? null : null
  const demoPredict = step && bundle ? bundle.predictFor(step.clip) : null
  const demoCompare = step && bundle ? bundle.compare : null

  return (
    <div className={`app${flow ? ' app--demo' : ''}`}>
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 12 7 12 10 5 14 19 17 12 21 12" />
            </svg>
          </span>
          <div>
            <h1>Rodent Behavior Analysis</h1>
            <p className="muted">Automatic behavior analysis from pose tracking</p>
          </div>
        </div>
        <div className="app__actions">
          {!flow && (
            <button type="button" className="button button--ghost" onClick={demo.start}>
              Guided demo
            </button>
          )}
          <ViewToggle
            mode={viewMode}
            onChange={(m) => {
              demo.exit()
              setViewMode(m)
            }}
          />
        </div>
      </header>

      {flow && loaded.status === 'error' && (
        <p className="status status--error" role="alert">
          The guided demo could not load its data. <button type="button" className="link-button" onClick={demo.exit}>Leave the demo</button>
        </p>
      )}
      {flow && loaded.status !== 'error' && (
        <p className="banner banner--demo" role="note">
          <strong>Guided demo.</strong> Precomputed real model output on two held-out CalMS21 test clips (Clip A and Clip B). The
          backend is not being called.
        </p>
      )}

      {!flow && mockMode && activeTab !== 'pharmacology' && activeTab !== 'groups' && (
        <p className="banner banner--demo" role="note">
          <strong>Demo mode.</strong> Results are canned sample data: the backend is not being called and uploaded
          files are ignored.
        </p>
      )}

      <nav className="tabs" role="tablist" aria-label="Views">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            type="button"
            className="tabs__tab"
            aria-selected={activeTab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => {
              demo.exit()
              setTab(t.id)
              if (t.id === 'groups') setGroupsOpened(true)
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Both panels stay mounted so switching tabs keeps each view's files and results. */}
      <main>
        <section id="panel-timeline" role="tabpanel" aria-labelledby="tab-timeline" hidden={activeTab !== 'timeline'}>
          <ErrorBoundary area="the timeline">
            <TimelineView mode={viewMode} onShowDetail={leaveDemoToDetail} preloaded={demoPredict} />
            {step?.showAgreement && demoClip && bundle && <ClipAgreement clip={demoClip} attribution={bundle.clips.attribution} />}
          </ErrorBoundary>
        </section>
        <section id="panel-compare" role="tabpanel" aria-labelledby="tab-compare" hidden={activeTab !== 'compare'}>
          <ErrorBoundary area="the comparison">
            <CompareView mode={viewMode} onShowDetail={leaveDemoToDetail} preloaded={demoCompare} names={bundle && step ? bundle.names : undefined} />
          </ErrorBoundary>
        </section>
        <section
          id="panel-pharmacology"
          role="tabpanel"
          aria-labelledby="tab-pharmacology"
          hidden={activeTab !== 'pharmacology'}
        >
          <ErrorBoundary area="the pharmacology demo">
            <Suspense fallback={<p className="muted">Loading…</p>}>
              <PharmacologyView />
            </Suspense>
          </ErrorBoundary>
        </section>
        <section id="panel-groups" role="tabpanel" aria-labelledby="tab-groups" hidden={activeTab !== 'groups'}>
          {(groupsOpened || activeTab === 'groups') && (
            <ErrorBoundary area="the behavior-group comparison">
              <Suspense fallback={<p className="muted">Loading…</p>}>
                <GroupComparisonView />
              </Suspense>
            </ErrorBoundary>
          )}
        </section>
      </main>

      {step && bundle && <DemoGuide steps={bundle.script} demo={demo} />}
    </div>
  )
}

export default App
