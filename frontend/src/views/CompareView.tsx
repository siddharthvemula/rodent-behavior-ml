import { useState, type FormEvent } from 'react'
import { api as defaultApi, type ApiClient } from '../api/client'
import type { CompareResult } from '../api/types'
import { CompareSummary } from '../components/CompareSummary'
import { ComparisonChart } from '../components/ComparisonChart'
import { FilePicker } from '../components/FilePicker'
import { StatusMessage } from '../components/StatusMessage'
import { useAsyncTask } from '../lib/useAsyncTask'
import type { ViewMode } from '../lib/useViewMode'

interface CompareViewProps {
  readonly api?: Pick<ApiClient, 'compare'>
  /** Which presentation to show for the result; the data is the same either way. */
  readonly mode?: ViewMode
  readonly onShowDetail?: () => void
}

export function CompareView({ api = defaultApi, mode = 'detail', onShowDetail }: CompareViewProps) {
  const [control, setControl] = useState<File | null>(null)
  const [treated, setTreated] = useState<File | null>(null)
  const { state, run, reset } = useAsyncTask<CompareResult>()
  const isLoading = state.status === 'loading'

  function selectFile(setter: (file: File | null) => void) {
    return (file: File | null) => {
      setter(file)
      reset()
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (control && treated) void run(() => api.compare(control, treated))
  }

  return (
    <div className="view">
      <header className="view__header">
        <h2>Compare two recordings</h2>
        <p className="muted">
          Runs the classifier on each recording separately and compares per-behavior frequencies between the two. It describes these recordings; it does not diagnose or measure a treatment effect.
        </p>
      </header>

      <form className="card form" onSubmit={handleSubmit}>
        <div className="form__pair">
          <FilePicker label="Recording A keypoints (JSON)" onChange={selectFile(setControl)} disabled={isLoading} />
          <FilePicker label="Recording B keypoints (JSON)" onChange={selectFile(setTreated)} disabled={isLoading} />
        </div>
        <p className="muted small">
          Demo data note: the demo compares two real CalMS21 recordings as a stand-in for control and treatment
          groups. This project has no real drug-trial data.
        </p>
        <button type="submit" className="button" disabled={!control || !treated || isLoading}>
          {isLoading ? 'Comparing…' : 'Compare behaviors'}
        </button>
      </form>

      <StatusMessage state={state} loadingText="Classifying both recordings…" />
      {state.status === 'success' && (
        <div key={mode} className="mode-enter">
          {mode === 'summary' ? (
            <CompareSummary result={state.data} onShowDetail={onShowDetail} />
          ) : (
            <div className="card">
              <ComparisonChart result={state.data} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
