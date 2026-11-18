import { useState } from 'react'
import { CompareView } from './views/CompareView'
import { TimelineView } from './views/TimelineView'
import './App.css'

const TABS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'compare', label: 'Control vs treated' },
] as const

type TabId = (typeof TABS)[number]['id']

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('timeline')

  return (
    <div className="app">
      <header className="app__header">
        <h1>Rodent Behavior Diagnosis</h1>
      </header>

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
