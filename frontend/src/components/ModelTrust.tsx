import type { CSSProperties } from 'react'
import { buildColorMap } from '../lib/behaviors'
import { behaviorInfo } from '../lib/behaviorInfo'
import { modelMetrics, rowNormalized, type ModelMetrics } from '../lib/modelMetrics'
import { orderLabels } from '../lib/summary'

interface ModelTrustProps {
  /** A behavior to call out (e.g. the one the Compare headline is about). */
  readonly highlight?: string | null
  readonly metrics?: ModelMetrics
}

const f1 = (v: number) => v.toFixed(2)
const pct = (v: number) => `${Math.round(v * 100)}%`

/** Collapsible card: how well the classifier did on recordings it never saw during training. */
export function ModelTrust({ highlight = null, metrics = modelMetrics }: ModelTrustProps) {
  const labels = orderLabels([...metrics.labels])
  const colors = buildColorMap(labels)
  const index = new Map(metrics.labels.map((l, i) => [l, i]))
  const normalized = rowNormalized(metrics.confusion)
  const highlighted = highlight && metrics.f1[highlight] !== undefined ? highlight : null
  const info = highlighted ? behaviorInfo(highlighted) : null

  return (
    <details className="trust" data-demo="model-trust">
      <summary>
        <span className="trust__title">How much to trust this</span>
        <span className="muted small">
          Tested on {metrics.nTest} recordings the model never saw · overall score {f1(metrics.macroF1)} out of 1.00
        </span>
      </summary>

      <div className="trust__body">
        {info && highlighted && (
          <p className="trust__callout">
            This result is about <strong>{info.title.toLowerCase()}</strong>. The model scored {f1(metrics.f1[highlighted])} on it (1.00 is perfect), and its
            “percent of recording” for it is typically off by about ±{Math.max(1, Math.round(metrics.timeShareError[highlighted] * 100))} {Math.round(metrics.timeShareError[highlighted] * 100) <= 1 ? 'point' : 'points'}.
          </p>
        )}

        <section aria-label="Score and time-share error by behavior">
          <h4 className="viz-heading">By behavior</h4>
          <p className="muted small viz-sub">
            Score = F1 (1.00 is perfect). Time-share error = how far off the model's “percent of recording” was, on average, per held-out recording.
          </p>
          <table className="data-table trust__table">
            <thead>
              <tr>
                <th scope="col">Behavior</th>
                <th scope="col" className="trust__bar-col">Score (F1)</th>
                <th scope="col" className="num">Time-share error</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((l) => (
                <tr key={l} className={l === highlighted ? 'is-highlight' : ''}>
                  <th scope="row">
                    <span className="swatch" style={{ background: colors[l] }} aria-hidden="true" />
                    {behaviorInfo(l).title}
                  </th>
                  <td className="trust__bar-col" aria-label={`F1 ${f1(metrics.f1[l])}`}>
                    <div className="meter" aria-hidden="true" style={{ ['--beh' as string]: colors[l] } as CSSProperties}>
                      <span className="meter__track">
                        <span className="meter__fill" style={{ width: `${metrics.f1[l] * 100}%` }} />
                      </span>
                      <span className="meter__value">{f1(metrics.f1[l])}</span>
                    </div>
                  </td>
                  <td className="num">±{(metrics.timeShareError[l] * 100).toFixed(1)} pts</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-label="What the model mixes up">
          <h4 className="viz-heading">What it mixes up</h4>
          <p className="muted small viz-sub">
            Each row: of the frames that truly were that behavior, the share the model labeled as each column. The diagonal is correct.
          </p>
          <div className="matrix-wrap">
            <table className="matrix" aria-label="Confusion matrix, percent of true frames">
              <thead>
                <tr>
                  <td />
                  <th scope="col" colSpan={labels.length} className="matrix__axis">Model said…</th>
                </tr>
                <tr>
                  <td />
                  {labels.map((l) => (
                    <th key={l} scope="col">{behaviorInfo(l).title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {labels.map((truth) => (
                  <tr key={truth}>
                    <th scope="row">{behaviorInfo(truth).title}</th>
                    {labels.map((pred) => {
                      const v = normalized[index.get(truth)!][index.get(pred)!]
                      return (
                        <td
                          key={pred}
                          className={truth === pred ? 'is-diag' : ''}
                          style={{ ['--v' as string]: v } as CSSProperties}
                          title={`${pct(v)} of true ${truth} frames were labeled ${pred}`}
                        >
                          {pct(v)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="matrix__side muted small" aria-hidden="true">Truth ↓</p>
          </div>
        </section>

        <p className="muted small trust__foot">
          For reference, always guessing “other” scores {f1(metrics.baselines.alwaysOther)} and shuffled labels {f1(metrics.baselines.shuffled)}.
          These results come from {metrics.dataset} (trained on {metrics.nTrain} recordings, tested on {metrics.nTest}) in one lab's setup, so
          accuracy on other cameras or arenas may be lower.
        </p>
      </div>
    </details>
  )
}
