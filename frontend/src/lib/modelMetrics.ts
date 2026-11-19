// Held-out test results of the bundled classifier, for the "How much to trust
// this" panel. The JSON is a trimmed copy of ml/metrics.json written by
// ml/export_frontend_metrics.py (a test keeps it current).
import raw from '../data/model_metrics.json'

export interface ModelMetrics {
  readonly dataset: string
  readonly nTrain: number
  readonly nTest: number
  readonly labels: readonly string[]
  readonly f1: Readonly<Record<string, number>>
  readonly macroF1: number
  /** Mean absolute error of each behavior's fraction of recording time (0-1). */
  readonly timeShareError: Readonly<Record<string, number>>
  /** Rows = true label, columns = predicted label, as frame counts. */
  readonly confusion: readonly (readonly number[])[]
  readonly baselines: { readonly alwaysOther: number; readonly shuffled: number }
}

export function loadModelMetrics(data: typeof raw = raw): ModelMetrics {
  const labels = data.labels
  const n = labels.length
  if (data.confusion_rows_true_cols_pred.length !== n || data.confusion_rows_true_cols_pred.some((r) => r.length !== n)) {
    throw new Error('model_metrics.json: confusion matrix does not match labels')
  }
  return {
    dataset: data.dataset,
    nTrain: data.n_train_recordings,
    nTest: data.n_test_recordings,
    labels,
    f1: data.test_f1,
    macroF1: data.test_macro_f1,
    timeShareError: data.test_time_share_mae,
    confusion: data.confusion_rows_true_cols_pred,
    baselines: { alwaysOther: data.baseline_macro_f1.always_other, shuffled: data.baseline_macro_f1.shuffled_labels },
  }
}

export const modelMetrics = loadModelMetrics()

/** Each row divided by its total: "of frames that truly were X, what share did the model call each label". */
export function rowNormalized(matrix: readonly (readonly number[])[]): readonly (readonly number[])[] {
  return matrix.map((row) => {
    const total = row.reduce((a, b) => a + b, 0)
    return row.map((v) => (total > 0 ? v / total : 0))
  })
}

/** The behavior the model is least reliable on (lowest F1), ignoring the catch-all `other`. */
export function weakestBehavior(m: ModelMetrics): string | null {
  const named = m.labels.filter((l) => l !== 'other')
  if (named.length === 0) return null
  return named.reduce((worst, l) => (m.f1[l] < m.f1[worst] ? l : worst))
}
