import { describe, expect, it } from 'vitest'
import type { BehaviorSegment, CompareResult } from '../api/types'
import { formatDuration, orderLabels, percent, summarizeComparison, summarizeRecording } from './summary'

const result = (control: Record<string, number>, treated: Record<string, number>): CompareResult => ({
  control,
  treated,
  difference: Object.fromEntries(
    [...new Set([...Object.keys(control), ...Object.keys(treated)])].map((k) => [k, (treated[k] ?? 0) - (control[k] ?? 0)]),
  ),
})

describe('summarizeComparison (headline comes from the data)', () => {
  const realistic = result(
    { attack: 0, investigation: 0.61, mount: 0.18, other: 0.21 },
    { attack: 0.44, investigation: 0.12, mount: 0, other: 0.43 },
  )

  it('leads with the behavior that changed most and says which way', () => {
    const s = summarizeComparison(realistic)
    expect(s.kind).toBe('changed')
    expect(s.lead?.label).toBe('investigation') // |-0.49| beats |+0.44|
    expect(s.headline).toBe('Investigating fell sharply from 61% to 12% of the time')
    expect(s.alsoNoted).toBe('Also: attacking jumped from 0% to 44% and mounting fell from 18% to 0%.')
  })

  it('changes when the data changes (nothing is hardcoded)', () => {
    const s = summarizeComparison(
      result({ attack: 0.02, investigation: 0.3, mount: 0.1, other: 0.58 }, { attack: 0.3, investigation: 0.28, mount: 0.1, other: 0.32 }),
    )
    expect(s.headline).toBe('Attacking jumped from 2% to 30% of the time')
    expect(s.alsoNoted).toBe('') // nothing else moved by 5+ points
  })

  it('never headlines the catch-all "other" when a named behavior is available', () => {
    const s = summarizeComparison(result({ investigation: 0.2, other: 0.8 }, { investigation: 0.26, other: 0.74 }))
    expect(s.lead?.label).toBe('investigation')
    expect(s.headline).toContain('Investigating')
  })

  it('uses "other" only when it is all there is', () => {
    const s = summarizeComparison(result({ other: 0.9 }, { other: 0.5 }))
    expect(s.lead?.label).toBe('other')
    expect(s.headline).toBe('Other activity fell sharply from 90% to 50% of the time')
  })

  it('says so when nothing meaningful changed', () => {
    const s = summarizeComparison(result({ attack: 0.1, investigation: 0.4, other: 0.5 }, { attack: 0.12, investigation: 0.38, other: 0.5 }))
    expect(s.kind).toBe('similar')
    expect(s.lead).toBeNull()
    expect(s.headline).toMatch(/about the same/i)
  })

  it('treats exactly 5 points as meaningful, 4.9 as not', () => {
    expect(summarizeComparison(result({ mount: 0.1, other: 0.9 }, { mount: 0.15, other: 0.85 })).kind).toBe('changed')
    expect(summarizeComparison(result({ mount: 0.1, other: 0.9 }, { mount: 0.149, other: 0.851 })).kind).toBe('similar')
  })

  it.each([
    [0.3, 'jumped'],
    [0.12, 'rose'],
    [0.06, 'rose slightly'],
    [-0.3, 'fell sharply'],
    [-0.12, 'fell'],
    [-0.06, 'fell slightly'],
  ])('describes a %s change as "%s"', (difference, verb) => {
    const control = 0.4
    const s = summarizeComparison(result({ mount: control }, { mount: control + difference }))
    expect(s.lead?.verb).toBe(verb)
  })

  it('handles an empty result', () => {
    expect(summarizeComparison({ control: {}, treated: {}, difference: {} }).kind).toBe('empty')
  })

  it('keeps a lead label outside the fixed vocabulary readable', () => {
    expect(summarizeComparison(result({ digging: 0.1 }, { digging: 0.5 })).headline).toBe('Digging jumped from 10% to 50% of the time')
  })
})

const seg = (start: number, end: number, label: string, confidence = 0.9): BehaviorSegment => ({
  start_time: start,
  end_time: end,
  behavior_label: label,
  confidence,
})

describe('summarizeRecording', () => {
  const segments = [seg(0, 60, 'investigation', 0.95), seg(60, 80, 'other', 0.5), seg(80, 100, 'mount', 0.9)]

  it('names the dominant behavior, share and recording length', () => {
    const s = summarizeRecording(segments)!
    expect(s.headline).toBe('Mostly investigating: 60% of this 1 min 40 s recording')
    expect(s.leadLabel).toBe('investigation')
    expect(s.context).toBe('The next most common was mounting (20%).')
  })

  it('computes time-weighted confidence and the longest stretch', () => {
    const s = summarizeRecording(segments)!
    // (0.95*60 + 0.5*20 + 0.9*20) / 100
    expect(s.meanConfidence).toBeCloseTo(0.85)
    expect(s.segmentCount).toBe(3)
    expect(s.longest).toEqual({ label: 'investigation', start: 0, end: 60, seconds: 60 })
  })

  it('does not claim dominance when no behavior reaches half the time', () => {
    const s = summarizeRecording([seg(0, 40, 'investigation'), seg(40, 75, 'mount'), seg(75, 100, 'other')])!
    expect(s.headline).toBe('No single behavior dominated this 1 min 40 s recording; investigating led at 40%')
  })

  it('looks past a dominant "other" to the named behaviors', () => {
    const s = summarizeRecording([seg(0, 80, 'other'), seg(80, 100, 'attack')])!
    expect(s.headline).toBe('Mostly other activity: 80% of this 1 min 40 s recording')
    expect(s.context).toBe('Among the named behaviors, attacking was most common (20% of the time).')
  })

  it('says when no named behavior occurred', () => {
    expect(summarizeRecording([seg(0, 30, 'other')])!.context).toBe('No attacking, investigating or mounting was detected.')
  })

  it('describes how the lead behavior was spread over the recording', () => {
    const many = [seg(0, 30, 'investigation'), seg(30, 40, 'other'), seg(40, 55, 'investigation'), seg(55, 60, 'mount'), seg(60, 100, 'investigation')]
    const s = summarizeRecording(many)!
    expect(s.leadStretches).toBe(3)
    expect(s.extra).toBe('Investigating came in 3 separate stretches, the longest lasting 40 s.')
    expect(summarizeRecording(segments)!.extra).toBe('Investigating happened in one continuous stretch of 1 min.')
  })

  it('returns null for an empty recording', () => {
    expect(summarizeRecording([])).toBeNull()
  })
})

describe('formatting helpers', () => {
  it('formats spoken durations', () => {
    expect(formatDuration(0)).toBe('0 s')
    expect(formatDuration(45.4)).toBe('45 s')
    expect(formatDuration(60)).toBe('1 min')
    expect(formatDuration(100)).toBe('1 min 40 s')
    expect(formatDuration(657)).toBe('10 min 57 s')
  })

  it('formats percentages', () => {
    expect(percent(0.444)).toBe('44%')
    expect(percent(0)).toBe('0%')
    expect(percent(1)).toBe('100%')
  })

  it('orders the fixed vocabulary first and the rest alphabetically', () => {
    expect(orderLabels(['other', 'zzz', 'mount', 'aaa', 'attack'])).toEqual(['attack', 'mount', 'other', 'aaa', 'zzz'])
  })
})
