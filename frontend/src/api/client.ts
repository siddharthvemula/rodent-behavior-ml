import predictMock from '../mocks/predict.json'
import compareMock from '../mocks/compare.json'
import type { CompareOutcome, JobStatus, PredictOutcome } from './types'
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
  predict(file: File): Promise<PredictOutcome>
  compare(control: File, treated: File): Promise<CompareOutcome>
}

interface EnvLike {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_USE_MOCK?: string
  /** True in production builds (set by Vite). */
  readonly PROD?: boolean
}

// Production builds are served from the same origin as the backend, which
// vercel.json routes under /api, so that is the default there.
const PRODUCTION_DEFAULT_BASE_URL = '/api'

/**
 * Mock (canned-data) mode is opt-in or dev-only, never an accident of a
 * missing env var:
 *  - VITE_USE_MOCK=true          -> mock, in any build
 *  - VITE_API_BASE_URL set       -> live backend at that URL
 *  - neither, production build   -> live backend at /api
 *  - neither, dev/test           -> mock (frontend-only development)
 * A deployed build that merely lacks VITE_API_BASE_URL (e.g. a Vercel preview
 * environment) used to silently show fake results; it now talks to /api.
 */
export function configFromEnv(env: EnvLike): Pick<ApiConfig, 'baseUrl' | 'useMock'> {
  const configured = (env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const baseUrl = configured || (env.PROD ? PRODUCTION_DEFAULT_BASE_URL : '')
  const useMock = env.VITE_USE_MOCK === 'true' || baseUrl.length === 0
  return { baseUrl, useMock }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** FastAPI sends `detail` as a string for our errors and as a list of {msg} objects for its own validation errors. */
function detailToText(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail.map((d) => (typeof d === 'object' && d !== null && 'msg' in d ? String(d.msg) : String(d)))
    return messages.join('; ')
  }
  return ''
}

// Used when the response has no readable detail, e.g. an error page from the hosting platform.
const STATUS_FALLBACKS: Readonly<Record<number, string>> = {
  413: 'the upload is too large for this deployment (about 4 MB total); trim the clip',
  502: 'the server had a problem; please try again',
  503: 'the server is not ready; please try again in a moment',
  504: 'the server took too long to respond; try a shorter recording',
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const text = detailToText(body.detail)
      if (text) return text
    }
  } catch {
    // Body was not JSON (platform error page); fall back below.
  }
  return STATUS_FALLBACKS[response.status] ?? (response.status >= 500 ? 'the server hit an error; please try again' : response.statusText || 'request failed')
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

  async function waitForJob(initial: JobStatus<unknown>): Promise<JobStatus<unknown>> {
    let job = initial
    for (let polls = 0; ; polls += 1) {
      if (job.status === 'done') return job
      if (job.status === 'failed') throw new ApiError(`Inference job ${job.job_id} failed`)
      if (polls >= maxPolls) throw new ApiError(`Inference job ${job.job_id} timed out`)
      await sleep(pollIntervalMs)
      job = await requestJob(`/jobs/${encodeURIComponent(job.job_id)}`)
    }
  }

  async function submit(path: string, form: FormData, mock: unknown): Promise<JobStatus<unknown>> {
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
      const job = await submit('/predict', form, predictMock)
      return { segments: parseSegments(job.result), warnings: job.warnings }
    },
    async compare(control, treated) {
      const form = new FormData()
      form.append('control', control)
      form.append('treated', treated)
      const job = await submit('/compare', form, compareMock)
      return { result: parseCompareResult(job.result), warnings: job.warnings, durations: job.durations }
    },
  }
}

export const apiConfig = configFromEnv(import.meta.env)
export const api: ApiClient = createApiClient(apiConfig)
