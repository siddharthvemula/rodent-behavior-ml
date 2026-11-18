import predictMock from '../mocks/predict.json'
import compareMock from '../mocks/compare.json'
import type { BehaviorSegment, CompareResult, JobStatus } from './types'
import { parseCompareResult, parseJobStatus, parseSegments } from './validate'

// Talks to the backend contract in ARCHITECTURE.md:
//   POST /predict  (multipart field "file")              -> JobStatus
//   POST /compare  (multipart fields "control","treated") -> JobStatus
//   GET  /jobs/{id}                                      -> JobStatus
// Inference is a background job, so a POST may return status "queued" or
// "running"; we then poll /jobs/{id} until "done" or "failed".

const DEFAULT_POLL_INTERVAL_MS = 1000
const DEFAULT_MAX_POLLS = 120
const MOCK_LATENCY_MS = 600

export class ApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiConfig {
  readonly baseUrl: string
  readonly useMock: boolean
  readonly pollIntervalMs?: number
  readonly maxPolls?: number
  readonly fetchImpl?: typeof fetch
  readonly sleep?: (ms: number) => Promise<void>
}

export interface ApiClient {
  predict(file: File): Promise<readonly BehaviorSegment[]>
  compare(control: File, treated: File): Promise<CompareResult>
}

interface EnvLike {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_USE_MOCK?: string
}

export function configFromEnv(env: EnvLike): Pick<ApiConfig, 'baseUrl' | 'useMock'> {
  const baseUrl = (env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const useMock = env.VITE_USE_MOCK === 'true' || baseUrl.length === 0
  return { baseUrl, useMock }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body) return String(body.detail)
  } catch {
    // Body was not JSON; fall back to the status text below.
  }
  return response.statusText || 'request failed'
}

export function createApiClient(config: ApiConfig): ApiClient {
  const fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init))
  const sleep = config.sleep ?? defaultSleep
  const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const maxPolls = config.maxPolls ?? DEFAULT_MAX_POLLS

  async function requestJob(path: string, init?: RequestInit): Promise<JobStatus<unknown>> {
    let response: Response
    try {
      response = await fetchImpl(`${config.baseUrl}${path}`, init)
    } catch (cause) {
      throw new ApiError(`Could not reach the backend at ${config.baseUrl}: ${String(cause)}`)
    }
    if (!response.ok) {
      throw new ApiError(`Backend returned ${response.status}: ${await readErrorDetail(response)}`)
    }
    return parseJobStatus(await response.json())
  }

  async function waitForJob(initial: JobStatus<unknown>): Promise<unknown> {
    let job = initial
    for (let polls = 0; ; polls += 1) {
      if (job.status === 'done') return job.result
      if (job.status === 'failed') throw new ApiError(`Inference job ${job.job_id} failed`)
      if (polls >= maxPolls) throw new ApiError(`Inference job ${job.job_id} timed out`)
      await sleep(pollIntervalMs)
      job = await requestJob(`/jobs/${encodeURIComponent(job.job_id)}`)
    }
  }

  async function submit(path: string, form: FormData, mock: unknown): Promise<unknown> {
    if (config.useMock) {
      await sleep(MOCK_LATENCY_MS)
      return waitForJob(parseJobStatus(mock))
    }
    return waitForJob(await requestJob(path, { method: 'POST', body: form }))
  }

  return {
    async predict(file) {
      const form = new FormData()
      form.append('file', file)
      return parseSegments(await submit('/predict', form, predictMock))
    },
    async compare(control, treated) {
      const form = new FormData()
      form.append('control', control)
      form.append('treated', treated)
      return parseCompareResult(await submit('/compare', form, compareMock))
    },
  }
}

export const api: ApiClient = createApiClient(configFromEnv(import.meta.env))
