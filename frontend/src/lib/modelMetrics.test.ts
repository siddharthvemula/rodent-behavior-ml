import { describe, expect, it } from 'vitest'
import raw from '../data/model_metrics.json'
import { loadModelMetrics, modelMetrics, rowNormalized, weakestBehavior } from './modelMetrics'

describe('modelMetrics', () => {
  it('loads the bundled held-out results', () => {
    expect(modelMetrics.labels).toEqual(['attack', 'investigation', 'mount', 'other'])
    expect(modelMetrics.nTest).toBe(19)
    expect(modelMetrics.macroF1).toBeGreaterThan(0.5)
  })

  it('rejects a confusion matrix that does not match the labels', () => {
    expect(() => loadModelMetrics({ ...raw, confusion_rows_true_cols_pred: [[1, 2]] })).toThrow(/confusion matrix/)
  })

  it('normalizes each row to sum to 1 and survives an empty row', () => {
    const n = rowNormalized([[1, 3], [0, 0]])
    expect(n[0]).toEqual([0.25, 0.75])
    expect(n[1]).toEqual([0, 0])
    for (const row of rowNormalized(modelMetrics.confusion)) expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })

  it('names the weakest named behavior, ignoring other', () => {
    expect(weakestBehavior(modelMetrics)).toBe('attack')
  })
})
