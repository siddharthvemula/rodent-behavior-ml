import { useEffect, useState, type FormEvent } from 'react'
import { api as defaultApi, type ApiClient } from '../api/client'
import type { BehaviorSegment } from '../api/types'
import { BehaviorTimeline } from '../components/BehaviorTimeline'
import { FilePicker } from '../components/FilePicker'
import { StatusMessage } from '../components/StatusMessage'
import { useAsyncTask } from '../lib/useAsyncTask'

interface TimelineViewProps {
  readonly api?: Pick<ApiClient, 'predict'>
}

/** Local preview URL for a selected video; null for non-video files or where unsupported. */
function useVideoPreviewUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file || !file.type.startsWith('video/') || typeof URL.createObjectURL !== 'function') {
      setUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  return url
}

export function TimelineView({ api = defaultApi }: TimelineViewProps) {
  const [file, setFile] = useState<File | null>(null)
  const { state, run, reset } = useAsyncTask<readonly BehaviorSegment[]>()
  const previewUrl = useVideoPreviewUrl(file)
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
          label="Video or keypoint file"
          hint="A recording or its pre-extracted pose keypoints."
          onChange={handleFileChange}
          disabled={isLoading}
        />
        <button type="submit" className="button" disabled={!file || isLoading}>
          {isLoading ? 'Predicting…' : 'Predict behaviors'}
        </button>
      </form>

      {previewUrl && <video className="card preview" src={previewUrl} controls muted />}

      <StatusMessage state={state} loadingText="Running behavior classifier…" />
      {state.status === 'success' && (
        <div className="card">
          <BehaviorTimeline segments={state.data} />
        </div>
      )}
    </div>
  )
}
