import { useState } from 'react'
import { apiConfig } from './api/client'
import { ViewToggle } from './components/ViewToggle'
import { useViewMode } from './lib/useViewMode'
import { CompareView } from './views/CompareView'
import { PharmacologyView } from './views/PharmacologyView'
import { TimelineView } from './views/TimelineView'
import './App.css'
import './summary.css'
import './pharmacology.css'

const TABS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'compare', label: 'Compare recordings' },
  { id: 'pharmacology', label: 'Pharmacology demo' },
] as const

type TabId = (typeof TABS)[number]['id']

interface AppProps {
  /** Whether the API client is serving canned data; defaults to the real config. */
  readonly mockMode?: boolean
}

function App({ mockMode = apiConfig.useMock }: AppProps) {
  const [activeTab, setActiveTab] = useState<TabId>('timeline')
  const [viewMode, setViewMode] = useViewMode('summary')

  return (
    <div className="app">
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
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </header>

      {mockMode && activeTab !== 'pharmacology' && (
        <p className="banner banner--demo" role="note">
          <strong>Demo mode.</strong> Results are canned sample data: the backend is not being called and uploaded
          files are ignored.
        </p>
      )}

      <nav className="tabs" role="tablist" aria-label="Views">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            type="button"
            className="tabs__tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Both panels stay mounted so switching tabs keeps each view's files and results. */}
      <main>
        <section id="panel-timeline" role="tabpanel" aria-labelledby="tab-timeline" hidden={activeTab !== 'timeline'}>
          <TimelineView mode={viewMode} onShowDetail={() => setViewMode('detail')} />
        </section>
        <section id="panel-compare" role="tabpanel" aria-labelledby="tab-compare" hidden={activeTab !== 'compare'}>
          <CompareView mode={viewMode} onShowDetail={() => setViewMode('detail')} />
        </section>
        <section
          id="panel-pharmacology"
          role="tabpanel"
          aria-labelledby="tab-pharmacology"
          hidden={activeTab !== 'pharmacology'}
        >
          <PharmacologyView />
        </section>
      </main>
    </div>
  )
}

export default App
