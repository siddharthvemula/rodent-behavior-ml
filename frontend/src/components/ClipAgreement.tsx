import type { CSSProperties } from 'react'
import { behaviorInfo } from '../lib/behaviorInfo'
import { KNOWN_BEHAVIORS, buildColorMap, formatSeconds } from '../lib/behaviors'
import { disagreementSpans, type DemoClip, type DemoClips } from '../lib/demoClips'

interface Props {
  readonly clip: DemoClip
  readonly attribution: DemoClips['attribution']
}

const pct = (v: number) => `${Math.round(v * 100)}%`

interface LaneSegment {
  readonly start_time: number
  readonly end_time: number
  readonly behavior_label: string
}

function Lane({ name, segments, seconds, colors }: { name: string; segments: readonly LaneSegment[]; seconds: number; colors: Readonly<Record<string, string>> }) {
  return (
    <div className="agree__row">
      <span className="agree__name">{name}</span>
      <div className="agree__lane" role="img" aria-label={`${name}: ${segments.length} segments over ${formatSeconds(seconds)}`}>
        {segments.map((s) => (
          <div
            key={`${s.start_time}-${s.behavior_label}`}
            className="agree__seg"
            title={`${s.behavior_label} ${formatSeconds(s.start_time)}–${formatSeconds(s.end_time)}`}
            style={{ left: `${(s.start_time / seconds) * 100}%`, width: `${((s.end_time - s.start_time) / seconds) * 100}%`, background: colors[s.behavior_label] } as CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * One clip, the model's prediction against the human annotation, frame for frame. Annotations are CalMS21's own
 * labels (CC BY 4.0), so the attribution is part of this panel and cannot be left out.
 */
export function ClipAgreement({ clip, attribution }: Props) {
  const seconds = clip.source.seconds
  const colors = buildColorMap([...KNOWN_BEHAVIORS])
  const spans = disagreementSpans(clip)
  const disagree = spans.reduce((s, x) => s + (x.end - x.start), 0) / seconds
  const a = clip.agreement

  return (
    <section className="card agree" data-demo="clip-agreement" aria-label={`${clip.label}: model predictions compared with human annotations`}>
      <h3 className="agree__title">{clip.label}: predicted vs. human-annotated</h3>
      <p className="muted small">
        The same {Math.round(seconds)} seconds of a held-out test recording, labeled by the model and by a human annotator. The recording was never used to train the model.
      </p>

      <ul className="legend">
        {KNOWN_BEHAVIORS.map((l) => (
          <li key={l}>
            <span className="swatch" style={{ background: colors[l] }} aria-hidden="true" />
            {behaviorInfo(l).title}
          </li>
        ))}
      </ul>

      <Lane name="Human annotation" segments={clip.annotations} seconds={seconds} colors={colors} />
      <Lane name="Model prediction" segments={clip.predictions} seconds={seconds} colors={colors} />
      <div className="agree__row">
        <span className="agree__name">Disagreement</span>
        <div className="agree__lane agree__lane--diff" role="img" aria-label={`Disagreement: ${spans.length} stretches, ${pct(disagree)} of the clip`}>
          {spans.map((s) => (
            <div
              key={s.start}
              className="agree__seg agree__seg--diff"
              title={`Disagree ${formatSeconds(s.start)}–${formatSeconds(s.end)}`}
              style={{ left: `${(s.start / seconds) * 100}%`, width: `${((s.end - s.start) / seconds) * 100}%` }}
            />
          ))}
        </div>
      </div>
      <div className="agree__axis muted" aria-hidden="true">
        <span>0:00</span>
        <span>{formatSeconds(seconds)}</span>
      </div>

      <p className="agree__stats">
        <strong>{pct(a.accuracy)}</strong> of frames agree · <strong>{pct(disagree)}</strong> disagree
      </p>

      <table className="data-table" aria-label={`${clip.label}: annotated and predicted time and score per behavior`}>
        <thead>
          <tr>
            <th scope="col">Behavior</th>
            <th scope="col" className="num">Annotated</th>
            <th scope="col" className="num">Predicted</th>
            <th scope="col" className="num">Score (F1)</th>
          </tr>
        </thead>
        <tbody>
          {KNOWN_BEHAVIORS.map((l) => {
            const f1 = a.per_class_f1[l]
            return (
              <tr key={l}>
                <th scope="row">{behaviorInfo(l).title}</th>
                <td className="num">{pct(a.time_share_annotated[l] ?? 0)}</td>
                <td className="num">{pct(a.time_share_predicted[l] ?? 0)}</td>
                <td className="num">{f1 === null || f1 === undefined ? <span className="muted">not in this clip</span> : f1.toFixed(2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="muted small agree__attribution">
        Human annotations: <a href={attribution.url} target="_blank" rel="noreferrer">{attribution.dataset}</a>, {attribution.citation}, used under{' '}
        <a href={attribution.license_url} target="_blank" rel="noreferrer">{attribution.license}</a>. {attribution.changes}
      </p>
    </section>
  )
}
