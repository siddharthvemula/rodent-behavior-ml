import type {
  BehaviorFrequencies,
  BehaviorSegment,
  CompareResult,
  JobState,
  JobStatus,
  RecordingDurations,
} from './types'

// Responses from the backend are untrusted input: validate them against the
// ARCHITECTURE.md contract before the UI renders anything.

export class ContractError extends Error {
  constructor(message: string) {
    super(`Unexpected response from backend: ${message}`)
    this.name = 'ContractError'
  }
}

const JOB_STATES: readonly JobState[] = ['queued', 'running', 'done', 'failed']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function parseJobStatus(raw: unknown): JobStatus<unknown> {
  if (!isRecord(raw)) throw new ContractError('job status is not an object')
  const { job_id, status, result, warnings, durations } = raw
  if (typeof job_id !== 'string' || job_id.length === 0) throw new ContractError('missing job_id')
  if (!JOB_STATES.includes(status as JobState)) throw new ContractError(`unknown job status "${String(status)}"`)
  return {
    job_id,
    status: status as JobState,
    result: result ?? null,
    warnings: parseWarnings(warnings),
    durations: parseDurations(durations),
  }
}

// `warnings` and `durations` are additive fields: an older backend omits them, so absent is fine.
function parseWarnings(raw: unknown): readonly string[] {
  return Array.isArray(raw) ? raw.filter((w): w is string => typeof w === 'string' && w.length > 0) : []
}

function parseDurations(raw: unknown): RecordingDurations | null {
  if (!isRecord(raw) || !isFiniteNumber(raw.control) || !isFiniteNumber(raw.treated)) return null
  return { control: raw.control, treated: raw.treated }
}

function parseSegment(raw: unknown, index: number): BehaviorSegment {
  if (!isRecord(raw)) throw new ContractError(`segment ${index} is not an object`)
  const { start_time, end_time, behavior_label, confidence } = raw
  if (!isFiniteNumber(start_time) || !isFiniteNumber(end_time)) {
    throw new ContractError(`segment ${index} has non-numeric times`)
  }
  if (end_time < start_time) throw new ContractError(`segment ${index} ends before it starts`)
  if (typeof behavior_label !== 'string') throw new ContractError(`segment ${index} has no behavior_label`)
  if (!isFiniteNumber(confidence)) throw new ContractError(`segment ${index} has non-numeric confidence`)
  return { start_time, end_time, behavior_label, confidence }
}

export function parseSegments(raw: unknown): readonly BehaviorSegment[] {
  if (!Array.isArray(raw)) throw new ContractError('predict result is not a list of segments')
  return raw.map(parseSegment)
}

function parseFrequencies(raw: unknown, field: string): BehaviorFrequencies {
  if (!isRecord(raw)) throw new ContractError(`compare.${field} is not an object`)
  const entries = Object.entries(raw)
  const invalid = entries.find(([, value]) => !isFiniteNumber(value))
  if (invalid) throw new ContractError(`compare.${field}.${invalid[0]} is not a number`)
  return Object.fromEntries(entries) as BehaviorFrequencies
}

export function parseCompareResult(raw: unknown): CompareResult {
  if (!isRecord(raw)) throw new ContractError('compare result is not an object')
  return {
    control: parseFrequencies(raw.control, 'control'),
    treated: parseFrequencies(raw.treated, 'treated'),
    difference: parseFrequencies(raw.difference, 'difference'),
  }
}
