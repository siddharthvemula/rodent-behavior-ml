import { useState, type FormEvent } from 'react'
import { api as defaultApi, type ApiClient } from '../api/client'
import type { BehaviorSegment } from '../api/types'
import { BehaviorTimeline } from '../components/BehaviorTimeline'
import { TimelineSummary } from '../components/TimelineSummary'
import { FilePicker } from '../components/FilePicker'
import { StatusMessage } from '../components/StatusMessage'
import { useAsyncTask } from '../lib/useAsyncTask'
import type { ViewMode } from '../lib/useViewMode'

interface TimelineViewProps {
  readonly api?: Pick<ApiClient, 'predict'>
  /** Which presentation to show for the result; the data is the same either way. */
  readonly mode?: ViewMode
  readonly onShowDetail?: () => void
}

export function TimelineView({ api = defaultApi, mode = 'detail', onShowDetail }: TimelineViewProps) {
  const [file, setFile] = useState<File | null>(null)
  const { state, run, reset } = useAsyncTask<readonly BehaviorSegment[]>()
  const isLoading = state.status === 'loading'

  function handleFileChange(next: File | null) {
    setFile(next)
    reset()
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (file) void run(() => api.predict(file))
  }

  return (
    <div className="view">
      <header className="view__header">
        <h2>Per-video behavior timeline</h2>
        <p className="muted">Classify behaviors over time for a single recording.</p>
      </header>

      <form className="card form" onSubmit={handleSubmit}>
        <FilePicker
          label="Keypoints file (JSON)"
          hint="Pose keypoints of the two mice as JSON. Raw video is not supported yet."
          onChange={handleFileChange}
          disabled={isLoading}
        />
        <button type="submit" className="button" disabled={!file || isLoading}>
          {isLoading ? 'Predicting…' : 'Predict behaviors'}
        </button>
      </form>

      <StatusMessage state={state} loadingText="Running behavior classifier…" />
      {state.status === 'success' && (
        <div key={mode} className="mode-enter">
          {mode === 'summary' ? (
            <TimelineSummary segments={state.data} onShowDetail={onShowDetail} />
          ) : (
            <div className="card">
              <BehaviorTimeline segments={state.data} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
