import { describe, expect, it } from 'vitest'
import { describeDurations } from './compareNotes'
import { checkFilePair, checkKeypointsFile, isSameFile } from './fileChecks'
import { parseJobStatus } from '../api/validate'

const file = (name: string, size: number, lastModified = 1) => {
  const f = new File(['x'], name, { lastModified })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('checkKeypointsFile', () => {
  it('accepts a normal JSON file and rejects empty, video, csv, oversized', () => {
    expect(checkKeypointsFile(file('a.json', 2_000_000))).toBeNull()
    expect(checkKeypointsFile(file('a.json', 0))).toMatch(/empty/)
    expect(checkKeypointsFile(file('A.MP4', 10))).toMatch(/video/)
    expect(checkKeypointsFile(file('a.csv', 10))).toMatch(/CSV/)
    expect(checkKeypointsFile(file('a.json', 4 * 1024 * 1024 + 1))).toMatch(/4 MB limit/)
  })
})

describe('checkFilePair / isSameFile', () => {
  it('limits the combined size', () => {
    expect(checkFilePair(file('a', 2_000_000), file('b', 2_000_000))).toBeNull()
    expect(checkFilePair(file('a', 3_000_000), file('b', 3_000_000))).toMatch(/Together/)
  })
  it('detects the same file by name, size and modified time', () => {
    expect(isSameFile(file('a.json', 5, 9), file('a.json', 5, 9))).toBe(true)
    expect(isSameFile(file('a.json', 5, 9), file('a.json', 6, 9))).toBe(false)
  })
})

describe('describeDurations', () => {
  it('returns null without durations', () => {
    expect(describeDurations(null)).toBeNull()
    expect(describeDurations({ control: 0, treated: 10 })).toBeNull()
  })
  it('stays quiet for comparable lengths, including exactly 3x', () => {
    expect(describeDurations({ control: 60, treated: 180 })?.caution).toBeNull()
  })
  it('cautions on short recordings and on a large ratio, naming both reasons when both apply', () => {
    expect(describeDurations({ control: 9, treated: 20 })?.caution).toMatch(/under 10 s/)
    expect(describeDurations({ control: 30, treated: 100 })?.caution).toMatch(/3× longer/)
    const both = describeDurations({ control: 5, treated: 100 })?.caution
    expect(both).toMatch(/under 10 s/)
    expect(both).toMatch(/20× longer/)
  })
})

describe('parseJobStatus additive fields', () => {
  it('defaults warnings to [] and durations to null when an older backend omits them', () => {
    const job = parseJobStatus({ job_id: 'j', status: 'done', result: null })
    expect(job.warnings).toEqual([])
    expect(job.durations).toBeNull()
  })
})

describe('intervals (additive compare field)', () => {
  const pair = { attack: [0, 0.1], investigation: [0.2, 0.4], mount: [0, 0.1], other: [0.3, 0.5] }
  const base = { job_id: 'j', status: 'done', result: null }

  it('parses well-formed intervals', async () => {
    const { parseJobStatus } = await import('../api/validate')
    const job = parseJobStatus({ ...base, intervals: { level: 0.95, control: pair, treated: pair, difference: pair } })
    expect(job.intervals?.level).toBe(0.95)
    expect(job.intervals?.control.investigation).toEqual([0.2, 0.4])
  })

  it('is null when an older backend omits them or they are malformed', async () => {
    const { parseJobStatus } = await import('../api/validate')
    expect(parseJobStatus(base).intervals).toBeNull()
    expect(parseJobStatus({ ...base, intervals: 'x' }).intervals).toBeNull()
    expect(parseJobStatus({ ...base, intervals: { level: 0.95, control: pair } }).intervals).toBeNull()
  })

  it('drops individual bad pairs instead of failing', async () => {
    const { parseJobStatus } = await import('../api/validate')
    const bad = { ...pair, attack: [0.5, 0.1], mount: ['a', 1] }
    const job = parseJobStatus({ ...base, intervals: { level: 0.95, control: bad, treated: pair, difference: pair } })
    expect(Object.keys(job.intervals!.control).sort()).toEqual(['investigation', 'other'])
  })
})
