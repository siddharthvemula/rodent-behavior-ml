import { describe, expect, it } from 'vitest'
import { demoCompareResult, clipById } from './demoClips'
import { demoClips } from './demoData'
import { buildDemoScript, mostConfusedWith } from './demoScript'
import { doseResponse } from './doseResponse'
import { modelMetrics } from './modelMetrics'
import { summarizeComparison } from './summary'

const script = buildDemoScript({ clips: demoClips, metrics: modelMetrics, stats: doseResponse })
const byId = (id: string) => script.find((s) => s.id === id)!
const text = (id: string) => [byId(id).title, ...byId(id).say, byId(id).caveat].join(' ')

describe('demo script structure', () => {
  it('is the eight planned steps, in order, with unique ids', () => {
    expect(script.map((s) => s.id)).toEqual(['intro', 'timeline', 'confidence', 'agreement', 'compare', 'trust', 'pharmacology', 'close'])
    expect(new Set(script.map((s) => s.id)).size).toBe(script.length)
  })

  it('opens and closes on interludes; every other step highlights something on the page', () => {
    expect(script[0].kind).toBe('interlude')
    expect(script[script.length - 1].kind).toBe('interlude')
    for (const s of script) {
      if (s.kind === 'screen') expect(s.target, s.id).toMatch(/^[a-z-]+$/)
      else expect(s.target, s.id).toBeNull()
    }
  })

  it('gives every step something to say AND something it does not show (a caveat is mandatory)', () => {
    for (const s of script) {
      expect(s.title.length, s.id).toBeGreaterThan(5)
      expect(s.say.length, s.id).toBeGreaterThanOrEqual(1)
      expect(s.caveat.length, `${s.id} caveat`).toBeGreaterThan(30)
    }
  })

  it('shows the human annotations only on the agreement step, on Clip B, where the attribution lives', () => {
    expect(script.filter((s) => s.showAgreement).map((s) => [s.id, s.clip])).toEqual([['agreement', 'clip_b']])
  })

  it('never uses wording that frames the clips as an experiment', () => {
    for (const s of script) expect(text(s.id), s.id).not.toMatch(/control|treat/i)
  })
})

describe('numbers come from the data, not from the script', () => {
  it('the timeline step quotes Clip A’s predicted and annotated shares', () => {
    const a = clipById(demoClips, 'clip_a').agreement
    const t = text('timeline')
    expect(t).toContain(`${Math.round(a.time_share_predicted.investigation * 100)}% of it on investigation`)
    expect(t).toContain(`The human annotators had ${Math.round(a.time_share_annotated.investigation * 100)}%`)
  })

  it('the agreement step quotes Clip B’s accuracy and per-class scores, including the weak one', () => {
    const b = clipById(demoClips, 'clip_b').agreement
    const t = text('agreement')
    expect(t).toContain(`Frame accuracy is ${Math.round(b.accuracy * 100)}%`)
    expect(t).toContain(`Attack scores ${b.per_class_f1.attack!.toFixed(2)}`)
    expect(t).toContain(`investigation only ${b.per_class_f1.investigation!.toFixed(2)}`)
    expect(byId('agreement').caveat).toMatch(/Mount never occurs/)
  })

  it('the comparison step narrates the same biggest change as the on-screen headline', () => {
    const lead = summarizeComparison(demoCompareResult(demoClips)).lead!
    const t = text('compare')
    expect(t).toContain(`${Math.round(lead.control * 100)}% of Clip A`)
    expect(t).toContain(`${Math.round(lead.treated * 100)}% of Clip B`)
    expect(byId('compare').caveat).toMatch(/not groups from an experiment/)
  })

  it('the trust step quotes the shipped model’s test score and number of test recordings', () => {
    const t = text('trust')
    expect(t).toContain(modelMetrics.macroF1.toFixed(2))
    expect(t).toContain(`${modelMetrics.nTest} recordings`)
  })

  it('the pharmacology step repeats the page’s own sentences, with their Holm p-values', () => {
    const t = text('pharmacology')
    expect(t).toMatch(/Distance traveled: .*Holm p/)
    expect(t).toMatch(/Time immobile: .*Holm p/)
    expect(byId('pharmacology').caveat).toMatch(/32 mice only/)
  })
})

describe('mostConfusedWith', () => {
  it('names the behavior a true behavior is most often mistaken for', () => {
    expect(mostConfusedWith(modelMetrics, 'attack')).toBe('investigation')
    const m = { ...modelMetrics, labels: ['a', 'b', 'c'], confusion: [[5, 1, 9], [0, 4, 0], [0, 0, 3]] }
    expect(mostConfusedWith(m, 'a')).toBe('c')
    expect(mostConfusedWith(m, 'nope')).toBeNull()
  })
})
