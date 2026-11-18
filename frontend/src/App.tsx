import { useState } from 'react'
import { apiConfig } from './api/client'
import { CompareView } from './views/CompareView'
import { TimelineView } from './views/TimelineView'
import './App.css'

const TABS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'compare', label: 'Control vs treated' },
] as const

type TabId = (typeof TABS)[number]['id']

interface AppProps {
  /** Whether the API client is serving canned data; defaults to the real config. */
  readonly mockMode?: boolean
}

function App({ mockMode = apiConfig.useMock }: AppProps) {
  const [activeTab, setActiveTab] = useState<TabId>('timeline')

  return (
    <div className="app">
      <header className="app__header">
        <h1>Rodent Behavior Diagnosis</h1>
      </header>

      {mockMode && (
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
          <TimelineView />
        </section>
        <section id="panel-compare" role="tabpanel" aria-labelledby="tab-compare" hidden={activeTab !== 'compare'}>
          <CompareView />
        </section>
      </main>
    </div>
  )
}

export default App
