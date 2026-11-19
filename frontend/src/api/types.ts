// Mirrors the API contract in ARCHITECTURE.md and the pydantic models in
// backend/main.py. Do not change these shapes without updating
// ARCHITECTURE.md and flagging it to the team first.

export interface BehaviorSegment {
  readonly start_time: number
  readonly end_time: number
  readonly behavior_label: string
  readonly confidence: number
}

/** Per-behavior frequency keyed by behavior label. */
export type BehaviorFrequencies = Readonly<Record<string, number>>

export interface CompareResult {
  readonly control: BehaviorFrequencies
  readonly treated: BehaviorFrequencies
  readonly difference: BehaviorFrequencies
}

export type JobState = 'queued' | 'running' | 'done' | 'failed'

/** Seconds of video in each recording; sent by the backend for compare jobs only. */
export interface RecordingDurations {
  readonly control: number
  readonly treated: number
}

export interface JobStatus<TResult> {
  readonly job_id: string
  readonly status: JobState
  readonly result: TResult | null
  /** Things the backend repaired or finds suspicious about the upload (additive field; may be absent). */
  readonly warnings: readonly string[]
  readonly durations: RecordingDurations | null
}

/** What predict()/compare() hand to the views: the result plus the backend's notes about the input. */
export interface PredictOutcome {
  readonly segments: readonly BehaviorSegment[]
  readonly warnings: readonly string[]
}

export interface CompareOutcome {
  readonly result: CompareResult
  readonly warnings: readonly string[]
  readonly durations: RecordingDurations | null
}
