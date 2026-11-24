import { useState, type FormEvent } from 'react'
import { api as defaultApi, type ApiClient } from '../api/client'
import type { PredictOutcome } from '../api/types'
import { BehaviorTimeline } from '../components/BehaviorTimeline'
import { TimelineSummary } from '../components/TimelineSummary'
import { FilePicker } from '../components/FilePicker'
import { Notices } from '../components/Notices'
import { StatusMessage } from '../components/StatusMessage'
import { useHeldLoading } from '../lib/useHeldLoading'
import { useAsyncTask, type TaskState } from '../lib/useAsyncTask'
import type { ViewMode } from '../lib/useViewMode'

interface TimelineViewProps {
  readonly api?: Pick<ApiClient, 'predict'>
  /** Which presentation to show for the result; the data is the same either way. */
  readonly mode?: ViewMode
  readonly onShowDetail?: () => void
  /** A result to show as if it had just been computed (the guided demo); hides the upload form. */
  readonly preloaded?: PredictOutcome | null
}

export function TimelineView({ api = defaultApi, mode = 'detail', onShowDetail, preloaded = null }: TimelineViewProps) {
  const [file, setFile] = useState<File | null>(null)
  const { state: ownState, run, reset } = useAsyncTask<PredictOutcome>()
  const state: TaskState<PredictOutcome> = preloaded ? { status: 'success', data: preloaded } : ownState
  const isLoading = state.status === 'loading'
  const loader = useHeldLoading(isLoading)

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

      {!preloaded && (
      <form className="card form" onSubmit={handleSubmit}>
        <FilePicker
          label="Keypoints file (JSON)"
          hint="Pose keypoints of the two mice as JSON, at least 3 s long, up to about 3.5 minutes (4 MB). Raw video and CSV are not supported."
          onChange={handleFileChange}
          disabled={isLoading}
        />
        <button type="submit" className="button" disabled={!file || isLoading}>
          {isLoading ? 'Predicting…' : 'Predict behaviors'}
        </button>
      </form>
      )}

      <StatusMessage state={state} loader={loader} loadingText="Running behavior classifier…" />
      {state.status === 'success' && !loader.mounted && (
        <div key={mode} className="mode-enter">
          <Notices notes={state.data.warnings} />
          {mode === 'summary' ? (
            <TimelineSummary segments={state.data.segments} onShowDetail={onShowDetail} />
          ) : (
            <div className="card">
              <BehaviorTimeline segments={state.data.segments} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
