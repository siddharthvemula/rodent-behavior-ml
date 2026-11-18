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

export interface JobStatus<TResult> {
  readonly job_id: string
  readonly status: JobState
  readonly result: TResult | null
}
