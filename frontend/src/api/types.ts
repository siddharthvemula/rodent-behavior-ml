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
  /** Compare jobs only; null when the backend does not send them. */
  readonly intervals: CompareIntervals | null
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
  readonly intervals: CompareIntervals | null
}

/** [low, high] as fractions of recording time. */
export type Interval = readonly [number, number]

/**
 * 95% block-bootstrap intervals per behavior (compare jobs only; additive, may
 * be absent). They describe how stable each recording's own estimate is; they
 * are not a test of whether two animals or groups differ.
 */
export interface CompareIntervals {
  readonly level: number
  readonly control: Readonly<Record<string, Interval>>
  readonly treated: Readonly<Record<string, Interval>>
  readonly difference: Readonly<Record<string, Interval>>
}
