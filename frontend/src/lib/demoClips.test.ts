import { describe, expect, it } from 'vitest'
import raw from '../data/demo_clips.json'
import { clipById, demoClips, demoCompareIntervals, demoCompareResult, parseDemoClips } from './demoClips'

const clone = () => JSON.parse(JSON.stringify(raw))

describe('committed demo_clips.json', () => {
  it('parses: two test-split clips called Clip A and Clip B', () => {
    expect(demoClips.clips.map((c) => c.label)).toEqual(['Clip A', 'Clip B'])
    expect(demoClips.clips.every((c) => c.source.split === 'test' && c.source.seconds === 100)).toBe(true)
    expect(clipById(demoClips, 'clip_b').label).toBe('Clip B')
  })

  it('carries a complete CC BY 4.0 attribution including what was changed', () => {
    const a = demoClips.attribution
    expect(a.license).toBe('CC BY 4.0')
    expect(a.license_url).toContain('creativecommons.org/licenses/by/4.0')
    expect(a.citation).toMatch(/Sun et al\./)
    expect(a.changes).toMatch(/not part of the dataset/)
  })

  it('never contains a two-group label', () => {
    expect(JSON.stringify(raw)).not.toMatch(/control|treat/i)
  })

  it('has annotated and predicted segments that cover each clip, and honest agreement numbers', () => {
    for (const c of demoClips.clips) {
      expect(c.annotations.length).toBeGreaterThan(5)
      expect(c.predictions.length).toBeGreaterThan(5)
      expect(c.agreement.accuracy).toBeGreaterThan(0.5)
      expect(c.agreement.accuracy).toBeLessThan(1)          // not a perfect score: the demo shows real errors
    }
    // Clip A has no attack in the annotation: its attack F1 does not exist (null), it is not scored 0.
    expect(clipById(demoClips, 'clip_a').agreement.per_class_f1.attack).toBeNull()
    expect(clipById(demoClips, 'clip_b').agreement.per_class_f1.attack).toBeGreaterThan(0.5)
  })
})

describe('parseDemoClips', () => {
  it('rejects any two-group wording, wherever it appears', () => {
    const a = clone()
    a.attribution.changes += ' Clip A is the control.'
    expect(() => parseDemoClips(a)).toThrow(/two-group label/)
    const b = clone()
    b.clips[1].source.recording = 'treated_recording'
    expect(() => parseDemoClips(b)).toThrow(/two-group label/)
  })

  it('rejects clips that are mislabeled, reordered or not from the test split', () => {
    const a = clone()
    a.clips.reverse()
    expect(() => parseDemoClips(a)).toThrow(/Clip A then Clip B/)
    const b = clone()
    b.clips[0].label = 'Recording A'
    expect(() => parseDemoClips(b)).toThrow(/Clip A then Clip B/)
    const c = clone()
    c.clips[0].source.split = 'train'
    expect(() => parseDemoClips(c)).toThrow(/not test/)
  })

  it('rejects an incomplete attribution (CC BY needs license, source and changes)', () => {
    for (const k of ['license', 'license_url', 'url', 'citation', 'changes']) {
      const a = clone()
      a.attribution[k] = ''
      expect(() => parseDemoClips(a), k).toThrow(/attribution/)
    }
    const b = clone()
    b.attribution.license = 'CC0'
    expect(() => parseDemoClips(b)).toThrow(/attribution/)
  })

  it('rejects broken segments, confidences, confusion matrices and intervals', () => {
    const gap = clone()
    gap.clips[0].annotations[3].start_time += 1
    expect(() => parseDemoClips(gap)).toThrow(/gap or overlap/)
    const unknown = clone()
    unknown.clips[1].predictions[0].behavior_label = 'grooming'
    expect(() => parseDemoClips(unknown)).toThrow(/unknown behavior/)
    const conf = clone()
    conf.clips[0].predictions[0].confidence = 1.4
    expect(() => parseDemoClips(conf)).toThrow(/confidence/)
    const cm = clone()
    cm.clips[0].agreement.confusion_rows_annotated_cols_predicted[0][0] += 5
    expect(() => parseDemoClips(cm)).toThrow(/confusion/)
    const acc = clone()
    acc.clips[1].agreement.accuracy = 0.99
    expect(() => parseDemoClips(acc)).toThrow(/accuracy/)
    const iv = clone()
    iv.compare_intervals.a.attack = [0.5, 0.1]
    expect(() => parseDemoClips(iv)).toThrow(/reversed/)
    const diff = clone()
    diff.compare.difference.attack = 0.9
    expect(() => parseDemoClips(diff)).toThrow(/b minus a/)
    expect(() => parseDemoClips({})).toThrow(/malformed/)
  })
})

describe('adapters to the existing Compare components', () => {
  it('maps A to the first recording and B to the second, with B minus A as the difference', () => {
    const r = demoCompareResult(demoClips)
    expect(r.control).toBe(demoClips.compare.a)
    expect(r.treated).toBe(demoClips.compare.b)
    expect(r.difference.attack).toBeGreaterThan(0.3)            // Clip B is the attack-heavy one
    const i = demoCompareIntervals(demoClips)
    expect(i.level).toBe(0.95)
    expect(i.control.attack).toEqual(demoClips.compare_intervals.a.attack)
  })
})
