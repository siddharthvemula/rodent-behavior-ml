import { DoseStripChart } from '../components/DoseStripChart'
import { EffectForest, EffectTable } from '../components/EffectForest'
import { TimeCourseChart, TimeCourseTable } from '../components/TimeCourseChart'
import {
  DOSES,
  PRIMARY_SPECS,
  doseResponse,
  effectAxis,
  forestRows,
  primaryMetric,
  richMice,
  summarizeComparisons,
  type DoseResponse,
} from '../lib/doseResponse'
import {
  METRICS,
  METRICS_B,
  groupByDose,
  mean,
  median,
  openField,
  type OpenFieldData,
  type RichMouse,
} from '../lib/openField'

interface Props {
  readonly data?: OpenFieldData
  readonly stats?: DoseResponse
  readonly mice?: readonly RichMouse[]
}

const mde = (d: number | null) => (d === null ? 'larger than any effect tested' : `d ≈ ${d.toFixed(1)}`)

/** Open-field pharmacology demo: yohimbine dose groups, real data, no classifier involved. */
export function PharmacologyView({ data = openField, stats = doseResponse, mice = richMice }: Props) {
  const groups = groupByDose(mice)
  const axis = effectAxis(stats)
  const perGroup = groups[0]?.mice.length ?? 0
  const fps = stats.phase_b.time_axis.fps_assumed
  const allMetrics = [...METRICS, ...METRICS_B]

  return (
    <div className="pharm">
      <p className="banner banner--real" role="note">
        <strong>Real data.</strong> Yohimbine open-field pose tracking (
        <a href={data.dataset.url} target="_blank" rel="noreferrer">
          Zenodo 8188683
        </a>
        , {data.dataset.license}). Metrics are computed directly from tracked body position. No behavior classifier is
        used here.
      </p>

      <section className="card" data-demo="pharm-effects" aria-labelledby="pharm-stats-heading">
        <h2 id="pharm-stats-heading">How each dose compares with saline</h2>
        <p className="muted">
          Each chart shows how far a dose group is from saline, as an effect size (Hedges&rsquo; g, in standard
          deviations) with its 95% interval. All charts share one axis, so sizes compare across metrics. Tests are
          exact permutation tests, Holm-adjusted across a fixed set of {PRIMARY_SPECS.length * (DOSES.length - 1)} planned
          comparisons. {stats.scope}
        </p>

        <ul className="pharm-findings">
          {PRIMARY_SPECS.map((spec) => (
            <li key={spec.key}>
              <strong>{spec.title}.</strong> {summarizeComparisons(primaryMetric(stats, spec.key), spec)}
            </li>
          ))}
        </ul>

        <div className="pharm-legend" aria-label="How to read the effect-size charts">
          {DOSES.slice(1).map((d, i) => (
            <span key={d} className="pharm-legend__item">
              <span className="pharm-legend__swatch" style={{ background: `var(--dose-${i + 1})` }} aria-hidden="true" />
              {d} mg/kg
            </span>
          ))}
          <span className="pharm-legend__item">
            <span className="pharm-legend__marker pharm-legend__marker--filled" aria-hidden="true" /> Holm p &lt; 0.05
          </span>
          <span className="pharm-legend__item">
            <span className="pharm-legend__marker" aria-hidden="true" /> not significant
          </span>
          <span className="pharm-legend__item">line = 95% interval</span>
        </div>

        <div className="pharm-grid-charts pharm-grid-charts--forest">
          {PRIMARY_SPECS.map((spec) => (
            <EffectForest key={spec.key} spec={spec} rows={forestRows(primaryMetric(stats, spec.key))} axis={axis} />
          ))}
        </div>

        <p className="muted pharm-note">
          &ldquo;Moving frames only&rdquo; counts center time just over the frames in which the mouse is moving, so a
          mouse that barely moves is not scored as preferring the center. It is a partial adjustment for locomotion, not
          a causal one.
        </p>

        <details>
          <summary>Table of every comparison</summary>
          <EffectTable data={stats} />
        </details>
      </section>

      <section className="card" aria-labelledby="pharm-heading">
        <h2 id="pharm-heading">Saline vs. yohimbine dose groups</h2>
        <p className="muted">
          The raw spread behind the statistics above. Each dot is one mouse. Solid line = group mean, dashed line = group
          median. With only {perGroup} mice per group, individual mice can sit well away from their group.
        </p>

        <div className="pharm-legend" aria-label="Dose groups">
          {groups.map((g, i) => (
            <span key={g.dose} className="pharm-legend__item">
              <span className="pharm-legend__swatch" style={{ background: `var(--dose-${i})` }} aria-hidden="true" />
              {g.label}
            </span>
          ))}
        </div>

        <div className="pharm-grid-charts">
          {METRICS.map((metric) => (
            <DoseStripChart key={metric.key} metric={metric} groups={groups} />
          ))}
          {METRICS_B.map((metric) => (
            <DoseStripChart key={metric.key} metric={metric} groups={groups} />
          ))}
        </div>

        <p className="muted pharm-note">
          Units are pixels in the camera image. The data has no physical scale, so nothing here is converted to cm.
          Speed is per video frame. Average speed is total distance divided by time, so it closely mirrors distance.
        </p>
      </section>

      <section className="card" aria-labelledby="pharm-time-heading">
        <h2 id="pharm-time-heading">How the distance effect unfolds over the session</h2>
        <p className="muted">
          <strong>Exploratory.</strong> The session is cut into {stats.phase_b.time_axis.n_bins} equal-length bins.
          Marker positions are group means; hover or focus a bin for each group&rsquo;s 95% interval and its effect size
          against saline. No p-values are given here, and bin-by-bin differences with {perGroup} mice per group are
          noisy, so read the overall shape, not single bins.
        </p>
        <div className="pharm-legend" aria-label="Dose groups">
          {groups.map((g, i) => (
            <span key={g.dose} className="pharm-legend__item">
              <span className="pharm-legend__line" style={{ background: `var(--dose-${i})` }} aria-hidden="true" />
              {g.label}
            </span>
          ))}
        </div>
        <TimeCourseChart data={stats} />
        <p className="muted pharm-note">
          The bins are equal numbers of video frames. Minutes assume {fps} frames per second, which is inferred from the
          original authors&rsquo; analysis code and is not stated in the dataset, so treat the time labels as
          approximate. The overall shape does not depend on it.
        </p>
        <details>
          <summary>Table of values</summary>
          <TimeCourseTable data={stats} />
        </details>
      </section>

      <section className="card" aria-labelledby="pharm-trust-heading">
        <h2 id="pharm-trust-heading">How much to trust this</h2>
        <ul className="pharm-trust">
          <li>
            <strong>Small groups.</strong> With {stats.power.n_per_group} mice per group, only large effects can be
            detected reliably: about {mde(stats.power.single_test.mde_d)} for a single comparison at 80% power, and about{' '}
            {mde(stats.power.whole_family_bonferroni.mde_d)} once the whole set of comparisons is corrected for. A
            comparison that is not significant does <em>not</em> show there is no effect.
          </li>
          <li>
            <strong>Intervals are optimistic.</strong> The 95% intervals come from resampling these {perGroup * groups.length}{' '}
            mice and tend to be a little too narrow with groups this small. The p-values are exact and do not have that
            problem.
          </li>
          <li>
            <strong>Planned versus exploratory.</strong> The four metrics above were fixed before the groups were
            compared. The time course and any extra metric are exploratory: effect sizes only, never to be read as
            findings.
          </li>
          <li>
            <strong>Choices that could matter.</strong> &ldquo;Immobile&rdquo; means a smoothed speed under 1 pixel per
            frame. Which doses differ from saline was unchanged at half and double that cutoff.
          </li>
          <li>
            <strong>One lab&rsquo;s setup.</strong> These are these {perGroup * groups.length} mice only. The page does
            not show that yohimbine has any effect beyond them, and it says nothing about the behavior classifier.
          </li>
        </ul>
      </section>

      <section className="card">
        <details>
          <summary>Group summary and per-mouse table</summary>
          <table className="pharm-table">
            <caption className="visually-hidden">Per-group mean and median for each metric</caption>
            <thead>
              <tr>
                <th scope="col">Group</th>
                {allMetrics.map((m) => (
                  <th key={m.key} scope="col">
                    {m.title} (mean / median)
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.dose}>
                  <th scope="row">{g.label}</th>
                  {allMetrics.map((m) => {
                    const v = g.mice.map((x) => m.value(x))
                    return (
                      <td key={m.key}>
                        {m.format(mean(v))} / {m.format(median(v))}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <table className="pharm-table">
            <caption className="visually-hidden">Per-mouse values</caption>
            <thead>
              <tr>
                <th scope="col">Animal</th>
                <th scope="col">Group</th>
                {allMetrics.map((m) => (
                  <th key={m.key} scope="col">
                    {m.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mice.map((mouse) => (
                <tr key={mouse.id}>
                  <th scope="row">{mouse.id}</th>
                  <td>{groups.find((g) => g.dose === mouse.dose_mg_kg)?.label}</td>
                  {allMetrics.map((m) => (
                    <td key={m.key}>{m.format(m.value(mouse))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className="card">
        <details>
          <summary>How these were computed</summary>
          <ul>
            <li>Position is the tracked <code>bodycentre</code> point from DeepLabCut pose files.</li>
            <li>
              Positions are normalized per recording using the four arena-corner markers, so small camera shifts
              between mice do not matter.
            </li>
            <li>
              Center = {data.parameters.center_definition}. Everything else is periphery.
            </li>
            <li>
              Frames with tracking likelihood below {data.parameters.min_likelihood} are dropped (gaps of 5 frames or
              fewer are interpolated), and any single-frame move over {data.parameters.max_step_px} px is counted as a
              tracking jump and excluded.
            </li>
            <li>
              Speed for immobility is the body-centre displacement across a centered 15-frame window divided by the
              window, which removes tracker jitter. A mouse counts as immobile below 1 pixel per frame and as moving at
              or above it.
            </li>
            <li>
              Effect sizes are Hedges&rsquo; g with percentile bootstrap intervals. P-values are exact two-sided
              permutation tests on the difference in group means, Holm-adjusted within each set of six planned
              comparisons and, more strictly, across all twelve.
            </li>
          </ul>
        </details>
      </section>

      <p className="muted pharm-attribution">
        Data: {data.dataset.citation} Licensed {data.dataset.license}. Metrics and statistics shown here are our own
        computation from that data, not the original authors&rsquo; analysis.
      </p>
    </div>
  )
}
