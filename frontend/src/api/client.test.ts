import { describe, expect, it, vi } from 'vitest'
import { ApiError, configFromEnv, createApiClient } from './client'
import predictMock from '../mocks/predict.json'
import compareMock from '../mocks/compare.json'

const BASE_URL = 'http://api.test'
const noSleep = () => Promise.resolve()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeFile(name: string): File {
  return new File(['keypoints'], name, { type: 'application/octet-stream' })
}

function liveClient(fetchImpl: typeof fetch, maxPolls = 5) {
  return createApiClient({ baseUrl: BASE_URL, useMock: false, fetchImpl, sleep: noSleep, maxPolls })
}

describe('configFromEnv', () => {
  it('uses mock mode when no base URL is set', () => {
    expect(configFromEnv({})).toEqual({ baseUrl: '', useMock: true })
  })

  it('uses the live backend when a base URL is set, stripping trailing slashes', () => {
    expect(configFromEnv({ VITE_API_BASE_URL: 'http://localhost:8000/ ' })).toEqual({
      baseUrl: 'http://localhost:8000',
      useMock: false,
    })
  })

  it('forces mock mode when VITE_USE_MOCK is "true"', () => {
    expect(configFromEnv({ VITE_API_BASE_URL: 'http://x', VITE_USE_MOCK: 'true' }).useMock).toBe(true)
  })

  it('a production build without VITE_API_BASE_URL talks to the same-origin /api, never canned data', () => {
    expect(configFromEnv({ PROD: true })).toEqual({ baseUrl: '/api', useMock: false })
    expect(configFromEnv({ PROD: true, VITE_API_BASE_URL: '   ' })).toEqual({ baseUrl: '/api', useMock: false })
  })

  it('an explicit VITE_API_BASE_URL wins over the production default', () => {
    expect(configFromEnv({ PROD: true, VITE_API_BASE_URL: 'https://api.example.com/' })).toEqual({
      baseUrl: 'https://api.example.com',
      useMock: false,
    })
  })

  it('mock mode in a production build is possible only by explicit opt-in', () => {
    expect(configFromEnv({ PROD: true, VITE_USE_MOCK: 'true' }).useMock).toBe(true)
    expect(configFromEnv({ PROD: true, VITE_USE_MOCK: 'false' }).useMock).toBe(false)
  })
})

describe('mock mode', () => {
  const client = createApiClient({ baseUrl: '', useMock: true, sleep: noSleep })

  it('returns the mocked predict timeline in contract shape', async () => {
    const segments = await client.predict(makeFile('a.mp4'))
    expect(segments).toEqual({ segments: predictMock.result, warnings: [] })
  })

  it('returns the mocked comparison in contract shape', async () => {
    const result = await client.compare(makeFile('c.mp4'), makeFile('t.mp4'))
    expect(result).toEqual({ result: compareMock.result, warnings: [], durations: null })
  })
})

describe('predict against the live backend', () => {
  it('posts the file as multipart field "file" and returns a finished result', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(predictMock))

    const segments = await liveClient(fetchImpl).predict(makeFile('a.mp4'))

    expect(segments.segments).toHaveLength(3)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${BASE_URL}/predict`)
    expect(init?.method).toBe('POST')
    expect((init?.body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('polls GET /jobs/{id} until the job is done', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ job_id: 'j1', status: 'queued', result: null }))
      .mockResolvedValueOnce(jsonResponse({ job_id: 'j1', status: 'running', result: null }))
      .mockResolvedValueOnce(jsonResponse({ ...predictMock, job_id: 'j1' }))

    const segments = await liveClient(fetchImpl).predict(makeFile('a.mp4'))

    expect(segments.segments).toEqual(predictMock.result)
    expect(fetchImpl.mock.calls[1][0]).toBe(`${BASE_URL}/jobs/j1`)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('throws when the job fails', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ job_id: 'j', status: 'failed', result: null }))
    await expect(liveClient(fetchImpl).predict(makeFile('a.mp4'))).rejects.toThrow(/failed/i)
  })

  it('gives up after maxPolls', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(jsonResponse({ job_id: 'j', status: 'running', result: null })))
    await expect(liveClient(fetchImpl, 2).predict(makeFile('a.mp4'))).rejects.toThrow(/timed out/i)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('surfaces the backend detail on HTTP errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ detail: 'job not found' }, 404))
    const error = await liveClient(fetchImpl)
      .predict(makeFile('a.mp4'))
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toMatch(/404.*job not found/)
  })

  it('reports network failures as ApiError', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(liveClient(fetchImpl).predict(makeFile('a.mp4'))).rejects.toThrow(/could not reach the backend/i)
  })

  it('rejects responses that do not match the contract', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ job_id: 'j', status: 'done', result: [{ start_time: 'zero' }] }))
    await expect(liveClient(fetchImpl).predict(makeFile('a.mp4'))).rejects.toThrow(/unexpected response/i)
  })
})

describe('compare against the live backend', () => {
  it('posts control and treated files and returns frequencies', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(compareMock))

    const result = await liveClient(fetchImpl).compare(makeFile('c.mp4'), makeFile('t.mp4'))

    expect(result.result.difference.attack).toBeCloseTo(0.15)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${BASE_URL}/compare`)
    const body = init?.body as FormData
    expect((body.get('control') as File).name).toBe('c.mp4')
    expect((body.get('treated') as File).name).toBe('t.mp4')
  })

  it('rejects a comparison with non-numeric frequencies', async () => {
    const bad = { job_id: 'j', status: 'done', result: { control: { a: 'x' }, treated: {}, difference: {} } }
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(bad))
    await expect(liveClient(fetchImpl).compare(makeFile('c'), makeFile('t'))).rejects.toThrow(/unexpected response/i)
  })
})

describe('additive warnings / durations fields', () => {
  it('passes backend warnings and compare durations through', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ ...compareMock, warnings: ['Recording A: Short recording'], durations: { control: 5, treated: 30 } }),
      )
    const out = await liveClient(fetchImpl).compare(makeFile('c.json'), makeFile('t.json'))
    expect(out.warnings).toEqual(['Recording A: Short recording'])
    expect(out.durations).toEqual({ control: 5, treated: 30 })
  })

  it('ignores malformed warnings/durations instead of failing the result', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ...compareMock, warnings: 'oops', durations: { control: 'x' } }))
    const out = await liveClient(fetchImpl).compare(makeFile('c.json'), makeFile('t.json'))
    expect(out.warnings).toEqual([])
    expect(out.durations).toBeNull()
  })
})

describe('error messages', () => {
  const failWith = (response: Response) =>
    liveClient(vi.fn<typeof fetch>().mockResolvedValue(response))
      .predict(makeFile('a.json'))
      .catch((e: unknown) => (e as Error).message)

  it('joins a FastAPI validation-error list instead of printing [object Object]', async () => {
    const msg = await failWith(jsonResponse({ detail: [{ msg: 'Field required' }, { msg: 'bad' }] }, 422))
    expect(msg).toMatch(/422: Field required; bad/)
    expect(msg).not.toMatch(/object Object/)
  })

  it('explains platform errors that have no JSON body', async () => {
    expect(await failWith(new Response('Request Entity Too Large', { status: 413 }))).toMatch(/too large.*4 MB/i)
    expect(await failWith(new Response('', { status: 504 }))).toMatch(/too long|shorter/i)
    expect(await failWith(new Response('<html>', { status: 500 }))).toMatch(/server hit an error/i)
  })
})
