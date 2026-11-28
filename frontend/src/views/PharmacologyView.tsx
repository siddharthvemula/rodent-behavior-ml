import { CountUpOnView } from '../components/CountUpOnView'
import { DoseStripChart } from '../components/DoseStripChart'
import { EffectForest, EffectTable } from '../components/EffectForest'
import { Hero, HeroStat } from '../components/Hero'
import { Methodology } from '../components/Methodology'
import type { ViewMode } from '../lib/useViewMode'
import { PharmacologySummary } from './PharmacologySummary'
import { TimeCourseChart, TimeCourseTable } from '../components/TimeCourseChart'
import {
  DOSES,
  PRIMARY_SPECS,
  doseResponse,
  effectAxis,
  formatSigned,
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
import { leadDoseEffect, binsBelowSaline, miceBelowAllSaline } from '../lib/pharmFindings'

interface Props {
  /** Summary shows one finding and one chart; Detail (the default here) shows everything. */
  readonly mode?: ViewMode
  readonly onShowDetail?: () => void
  readonly data?: OpenFieldData
  readonly stats?: DoseResponse
  readonly mice?: readonly RichMouse[]
}

const mde = (d: number | null) => (d === null ? 'larger than any effect tested' : `d ≈ ${d.toFixed(1)}`)

/** Open-field pharmacology demo: yohimbine dose groups, real data, no classifier involved. */
export function PharmacologyView({ data = openField, stats = doseResponse, mice = richMice, mode = 'detail', onShowDetail }: Props) {
  if (mode === 'summary') return <PharmacologySummary data={data} stats={stats} onShowDetail={onShowDetail} />

  const groups = groupByDose(mice)
  const axis = effectAxis(stats)
  const perGroup = groups[0]?.mice.length ?? 0
  const fps = stats.phase_b.time_axis.fps_assumed
  const allMetrics = [...METRICS, ...METRICS_B]
  const lead = leadDoseEffect(stats)
  const spread = miceBelowAllSaline(mice)
  const bins = binsBelowSaline(stats)

  return (
    <div className="pharm">
      <p className="banner banner--real" role="note">
        <strong>Real data.</strong> Yohimbine open-field pose tracking (
        <a href={data.dataset.url} target="_blank" rel="noreferrer">
          Zenodo 8188683
        </a>
        , {data.dataset.license}). No behavior classifier is used here.
      </p>

      <div className="finding" data-demo="pharm-effects">
        <Hero
          label="finding"
          color="var(--accent)"
          eyebrow={lead ? `Key finding · ${lead.spec.title.toLowerCase()}, ${lead.doseName} vs saline` : 'Key finding · planned comparisons'}
          headline={lead ? lead.sentence : `No dose was clearly different from saline on any planned metric`}
          context={
            lead
              ? `The largest effect that held up after correction (Hedges’ g ${formatSigned(lead.g)}, Holm ${lead.pText}), with ${stats.power.n_per_group} mice per group.`
              : `That does not show there is no effect: there are only ${stats.power.n_per_group} mice per group.`
          }
          stat={
            lead && (
              <HeroStat
                label="Biggest effect"
                unit={lead.statUnit}
                caption={`mean ${lead.spec.title.toLowerCase()}, ${lead.doseName} vs saline`}
                spoken={lead.spoken}
              >
                <CountUpOnView value={lead.size} format={(x) => `${lead.sign}${Math.round(x)}`} />
              </HeroStat>
            )
          }
        >
          {lead ? lead.sentence : 'No dose was clearly different from saline on any planned metric'}
        </Hero>

        <Methodology>
          <h3>How much to trust this</h3>
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
              <strong>Planned versus exploratory.</strong> The four planned metrics (the effect-size charts) were fixed before
              the groups were compared. The time course and any extra metric are exploratory: effect sizes only, never to be read as
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

          <h3>Reading the effect-size charts</h3>
          <p>
            Each chart shows how far a dose group is from saline, as an effect size (Hedges&rsquo; g, in standard
            deviations) with its 95% interval. All charts share one axis, so sizes compare across metrics. Tests are
            exact permutation tests, Holm-adjusted across a fixed set of {PRIMARY_SPECS.length * (DOSES.length - 1)} planned
            comparisons. {stats.scope}
          </p>
          <p>
            &ldquo;Moving frames only&rdquo; counts center time just over the frames in which the mouse is moving, so a
            mouse that barely moves is not scored as preferring the center. It is a partial adjustment for locomotion, not
            a causal one.
          </p>

          <h3>Mouse-by-mouse values</h3>
          <p>With only {perGroup} mice per group, individual mice can sit well away from their group.</p>
          <p>
            Units are pixels in the camera image. The data has no physical scale, so nothing here is converted to cm.
            Speed is per video frame. Average speed is total distance divided by time, so it closely mirrors distance.
          </p>

          <h3>Time course</h3>
          <p>
            <strong>Exploratory.</strong> The session is cut into {stats.phase_b.time_axis.n_bins} equal-length bins. No
            p-values are given, and bin-by-bin differences with {perGroup} mice per group are noisy, so read the overall
            shape, not single bins.
          </p>
          <p>
            The bins are equal numbers of video frames. Minutes assume {fps} frames per second, which is inferred from the
            original authors&rsquo; analysis code and is not stated in the dataset, so treat the time labels as
            approximate. The overall shape does not depend on it.
          </p>

          <h3>How these were computed</h3>
          <p>Metrics are computed directly from tracked body position. No behavior classifier is used here.</p>
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
        </Methodology>

        <section className="card support" aria-labelledby="pharm-stats-heading">
          <h3 id="pharm-stats-heading">How each dose compares with saline</h3>
          <p className="muted small">Effect size against saline (Hedges&rsquo; g) with its 95% interval, on one shared axis.</p>
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

          <ul className="pharm-findings">
            {PRIMARY_SPECS.map((spec) => (
              <li key={spec.key}>
                <strong>{spec.title}.</strong> {summarizeComparisons(primaryMetric(stats, spec.key), spec)}
              </li>
            ))}
          </ul>

          <details>
            <summary>Table of every comparison</summary>
            <EffectTable data={stats} />
          </details>
        </section>
      </div>

      <div className="finding">
        <Hero
          label="finding"
          color="var(--accent)"
          eyebrow="Mouse by mouse · total distance"
          headline={spread.sentence}
          context="A count of these mice, not a separate statistical test."
          stat={
            <HeroStat label="Below all saline mice" unit={`of ${spread.of}`} caption={`${spread.doseName} mice, total distance`} spoken={`${spread.count} of ${spread.of} mice`}>
              <CountUpOnView value={spread.count} />
            </HeroStat>
          }
        >
          {spread.sentence}
        </Hero>

        <section className="card support" aria-labelledby="pharm-heading">
          <h3 id="pharm-heading">Saline vs. yohimbine dose groups</h3>
          <p className="muted small">Each dot is one mouse. Solid line = group mean, dashed line = group median.</p>

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
        </section>
      </div>

      <div className="finding">
        <Hero
          label="finding"
          color="var(--accent)"
          eyebrow="Exploratory pattern · not a tested result"
          headline={bins.sentence}
          context="No p-values here, and single bins are noisy: read the overall shape."
          stat={
            <HeroStat label="Time bins below saline" unit={`of ${bins.of}`} caption={`group means, ${bins.doseName}`} spoken={`${bins.count} of ${bins.of} time bins`}>
              <CountUpOnView value={bins.count} />
            </HeroStat>
          }
        >
          {bins.sentence}
        </Hero>

        <section className="card support" aria-labelledby="pharm-time-heading">
          <h3 id="pharm-time-heading">How the distance effect unfolds over the session</h3>
          <p className="muted small">
            Markers are group means. Hover or focus a bin for each group&rsquo;s 95% interval and effect size against saline.
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
          <details>
            <summary>Table of values</summary>
            <TimeCourseTable data={stats} />
          </details>
        </section>
      </div>

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

      <p className="muted pharm-attribution">
        Data: {data.dataset.citation} Licensed {data.dataset.license}. Metrics and statistics shown here are our own
        computation from that data, not the original authors&rsquo; analysis.
      </p>
    </div>
  )
}
