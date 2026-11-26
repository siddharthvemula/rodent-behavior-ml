import { CountUpOnView } from '../components/CountUpOnView'
import { GroupEffectTable, GroupForest } from '../components/GroupForest'
import { GroupStripChart } from '../components/GroupStripChart'
import { Hero, HeroStat } from '../components/Hero'
import { Methodology } from '../components/Methodology'
import {
  BEHAVIOR_SPECS,
  CONTRASTS,
  GROUPS,
  GROUP_LABEL,
  KINDS,
  effectAxis,
  familyOutcome,
  formatP,
  formatSigned,
  groupComparison,
  metricKey,
  pText,
  summarizeBehavior,
  zeroShare,
  type GroupComparison,
} from '../lib/groupComparison'

interface Props {
  readonly stats?: GroupComparison
}

const mde = (d: number | null) => (d === null ? 'larger than any effect tested' : `d ≈ ${d.toFixed(1)}`)
const pct = (x: number) => `${Math.round(x * 100)}%`

/** Behavior across manipulation groups: the lab's own human annotations, descriptive group comparison, no classifier. */
export function GroupComparisonView({ stats = groupComparison }: Props) {
  const axis = effectAxis(stats)
  const out = familyOutcome(stats)
  const n = stats.design.groups
  const total = GROUPS.reduce((a, g) => a + n[g], 0)
  const ts = stats.time_shift
  const shiftedTotal = GROUPS.reduce((a, g) => a + ts.videos_shifted_by_group[g], 0)
  const rare = BEHAVIOR_SPECS.filter((b) => GROUPS.some((g) => zeroShare(stats, b.key)[g] >= 0.5))
  const alpha = stats.design.alpha
  const outcome =
    out.significant === 0
      ? `None of the ${out.total} planned comparisons with naive held up after correction`
      : `${out.significant} of ${out.total} planned comparisons remain significant after correction`
  const sparse = `In ${rare.length} of ${BEHAVIOR_SPECS.length} behaviors, at least half the recordings in some group show none at all`

  return (
    <div className="pharm grp">
      <p className="banner banner--real" role="note">
        <strong>Real data, human annotations.</strong> One lab&rsquo;s resident&ndash;intruder recordings from{' '}
        <a href={stats.dataset.url} target="_blank" rel="noreferrer">
          DANDI 000564
        </a>{' '}
        ({stats.dataset.license}). The behavior classifier is not used here.
      </p>

      <div className="finding" data-demo="grp-effects">
        <div data-testid="family-outcome">
          <Hero
            label="finding"
            color="var(--accent)"
            eyebrow="Key finding · each group vs naive"
            headline={outcome}
            context={`This does not show the groups are the same: with only ${n.naive} naive recordings, small and moderate differences can easily be missed.`}
            stat={
              <HeroStat
                label="Held up after correction"
                unit={`of ${out.total}`}
                caption={`smallest adjusted ${pText(out.smallestHolm).replace(/ /g, '\u00a0')}`}
                spoken={`${out.significant} of ${out.total} comparisons`}
              >
                <CountUpOnView value={out.significant} />
              </HeroStat>
            }
          >
            {outcome}
          </Hero>
        </div>

        <Methodology>
          <div data-testid="caveats">
            <h3>What these comparisons can and cannot show</h3>
            <p>
              Every number is computed from the behaviors the lab&rsquo;s own scorers marked by hand. The behavior classifier is not used
              here: its classes do not match this lab&rsquo;s scoring vocabulary.
            </p>
          <ul className="pharm-trust">
              <li>
                <strong>Observed group difference, not a treatment effect.</strong> The groups are compared as they were recorded. The dataset
                documents no randomization, so a difference here is not a validated causal effect of stress, isolation or mating.
              </li>
              <li>
                <strong>What &ldquo;stress&rdquo; means.</strong> The stress group is foot-shock stress, per a dataset contributor. The
                archive&rsquo;s own metadata labels these recordings only &ldquo;stress&rdquo; and does not describe the protocol.
              </li>
              <li>
                <strong>The naive group is small.</strong> Naive n = {n.naive} (against {n.stress}, {n.isolation} and {n.mated}), and every
                comparison is against it. That limits power: about {mde(stats.power.single_test.mde_d)} for one comparison at 80% power, and
                about {mde(stats.power.whole_family_bonferroni.mde_d)} once all {out.total} are corrected for. A comparison that is not
                significant does <em>not</em> show there is no difference.
              </li>
              <li>
                <strong>Recordings may not be fully independent.</strong> Each of the {total} recordings is a different resident mouse and is
                analysed as an independent unit. The archive does not say how many sessions, cohorts, days or intruder animals these share, and
                animals recorded together or against the same intruder can behave alike. If so, the p-values here are too optimistic.
              </li>
            </ul>
          </div>

          <h3>Reading the effect-size charts</h3>
          <p>
            Each row is one planned comparison against the naive group, shown as an effect size (Hedges&rsquo; g, in standard
            deviations) with its 95% interval. Both charts share one axis. Tests are exact permutation tests, Holm-adjusted across all{' '}
            {out.total} planned comparisons ({BEHAVIOR_SPECS.length} behaviors &times; {KINDS.length} metrics &times; {CONTRASTS.length}{' '}
            groups), fixed before the groups were compared.
          </p>
          <p>
            Time in behavior is the share of the recording&rsquo;s observed window; bout frequency is bouts per minute of that window.
            Intervals are wide because most of these behaviors are rare.
          </p>

          <h3>How much to trust this</h3>
          <ul className="pharm-trust">
            {rare.length > 0 && (
              <li>
                <strong>Rare behaviors.</strong> In {rare.map((b) => b.title.toLowerCase()).join(', ')}, at least half of the recordings in
                some group have no bout at all (for {rare[0].title.toLowerCase()}:{' '}
                {GROUPS.map((g) => `${pct(zeroShare(stats, rare[0].key)[g])} of ${GROUP_LABEL[g].toLowerCase()}`).join(', ')}). With that many
                zeros a difference in means is driven by a few recordings, and the intervals are very wide.
              </li>
            )}
            <li>
              <strong>The dataset shifted some of the scoring.</strong> The archive moved the scored bouts earlier (by{' '}
              {Math.min(...ts.offsets_frames.map(Math.abs))}&ndash;{Math.max(...ts.offsets_frames.map(Math.abs))} frames) in {shiftedTotal} of{' '}
              {total} recordings after finding them late relative to the video:{' '}
              {GROUPS.map((g) => `${ts.videos_shifted_by_group[g]} of ${ts.videos_by_group[g]} ${GROUP_LABEL[g].toLowerCase()}`).join(', ')}.
              Time and bout counts are barely affected by shifting a whole recording by about a second, but the naive group is the most
              affected, and re-running without shifted recordings is not possible (only {ts.unshifted_by_group.naive} naive recordings would
              remain).
            </li>
            <li>
              <strong>Intervals are optimistic.</strong> The 95% intervals come from resampling these {total} recordings and tend to be a
              little too narrow with groups this small. The p-values are exact and do not have that problem.
            </li>
            <li>
              <strong>Planned versus exploratory.</strong> The {out.total} planned comparisons were fixed before the groups were compared. The
              table below compares the non-naive groups with each other as an exploratory extra: effect sizes and raw p only, never to be read
              as findings.
            </li>
            <li>
              <strong>One lab, one setup.</strong> These are the resident mouse&rsquo;s behaviors toward one intruder in this lab&rsquo;s
              sessions. Nothing here shows the same would hold elsewhere, and it says nothing about the behavior classifier.
            </li>
          </ul>

          <details>
            <summary>Exploratory: non-naive groups compared with each other</summary>
            <div className="grp-table-scroll">
              <table className="pharm-table">
                <caption className="visually-hidden">Exploratory effect sizes between the non-naive groups, unadjusted</caption>
                <thead>
                  <tr>
                    <th scope="col">Behavior and metric</th>
                    <th scope="col">Comparison</th>
                    <th scope="col">Effect size g (95% CI)</th>
                    <th scope="col">Raw p (not adjusted)</th>
                  </tr>
                </thead>
                <tbody>
                  {BEHAVIOR_SPECS.flatMap((b) =>
                    KINDS.flatMap((k) =>
                      stats.between_groups_exploratory.metrics[metricKey(b.key, k.key)].map((r) => (
                        <tr key={`${b.key}-${k.key}-${r.a}-${r.b}`}>
                          <th scope="row">
                            {b.title}, {k.title.toLowerCase()}
                          </th>
                          <td>
                            {GROUP_LABEL[r.a]} vs {GROUP_LABEL[r.b].toLowerCase()}
                          </td>
                          <td>
                            {formatSigned(r.hedges_g)} ({formatSigned(r.g_ci[0], 1)} to {formatSigned(r.g_ci[1], 1)})
                          </td>
                          <td>{formatP(r.p_perm)}</td>
                        </tr>
                      )),
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </details>

          <h3>How these were computed</h3>
          <ul>
            <li>
              Behaviors are the lab&rsquo;s human-scored bouts of the resident mouse. Only the six scored in every recording of every group
              are used ({BEHAVIOR_SPECS.map((b) => b.title.toLowerCase()).join(', ')}). Allo-grooming and escape are left out because they
              were scored in only some recordings of each group. The intruder&rsquo;s own scored behavior is not counted.
            </li>
            <li>
              The observed window is the span of video frames that have pose tracking ({stats.window_minutes_range[0]}&ndash;
              {stats.window_minutes_range[1]} minutes per recording), not the frame numbers in the file, which do not start at zero. Time in
              behavior is the share of that window covered by the behavior; same-behavior bouts that overlap or touch are merged before
              counting.
            </li>
            <li>
              P-values are exact two-sided permutation tests on the difference in group means (all relabelings enumerated, none sampled),
              Holm-adjusted across the {out.total} planned comparisons. Effect sizes are Hedges&rsquo; g with percentile bootstrap
              intervals.
            </li>
            <li>The competition&rsquo;s train/test split plays no role: no model is fitted, so there is nothing to hold out.</li>
          </ul>
        </Methodology>

        <section className="card support" aria-labelledby="grp-stats-heading">
          <h3 id="grp-stats-heading">How each group compares with naive</h3>
          <p className="muted small">
            Effect size against naive (Hedges&rsquo; g) with its 95% interval, on one shared axis. The number at the right of each row
            is its Holm-adjusted p.
          </p>
          <p className="small" data-testid="raw-p-note">
            {out.rawBelowAlpha} had a raw p below {alpha} before correction; with {out.total} tests, about{' '}
            {out.expectedByChance.toFixed(1)} would be expected by chance alone, so those are not findings.
          </p>

          <div className="pharm-legend" aria-label="How to read the effect-size charts">
            {CONTRASTS.map((g, i) => (
              <span key={g} className="pharm-legend__item">
                <span className="pharm-legend__swatch" style={{ background: `var(--grp-${i + 1})` }} aria-hidden="true" />
                {GROUP_LABEL[g]}
              </span>
            ))}
            <span className="pharm-legend__item">
              <span className="pharm-legend__marker pharm-legend__marker--filled" aria-hidden="true" /> Holm p &lt; {alpha}
            </span>
            <span className="pharm-legend__item">
              <span className="pharm-legend__marker" aria-hidden="true" /> not significant
            </span>
            <span className="pharm-legend__item">line = 95% interval</span>
          </div>

          <div className="pharm-grid-charts pharm-grid-charts--forest">
            {KINDS.map((k) => (
              <GroupForest key={k.key} data={stats} kind={k.key} axis={axis} />
            ))}
          </div>

          <ul className="pharm-findings">
            {BEHAVIOR_SPECS.map((b) => (
              <li key={b.key}>
                <strong>{b.title}</strong> <span className="muted">({b.gloss}).</span> {summarizeBehavior(stats, b.key)}
              </li>
            ))}
          </ul>

          <details>
            <summary>Table of every comparison</summary>
            <GroupEffectTable data={stats} />
          </details>
        </section>
      </div>

      <div className="finding">
        <Hero
          label="finding"
          color="var(--accent)"
          eyebrow="Recording by recording · the raw spread"
          headline={sparse}
          context="Where most values are zero, a group’s average rests on a few recordings, so look at the dots and not only the mean lines."
          stat={
            <HeroStat
              label="Often-absent behaviors"
              unit={`of ${BEHAVIOR_SPECS.length}`}
              caption="absent in half or more of a group’s recordings"
              spoken={`${rare.length} of ${BEHAVIOR_SPECS.length} behaviors`}
            >
              <CountUpOnView value={rare.length} />
            </HeroStat>
          }
        >
          {sparse}
        </Hero>

        <section className="card support" aria-labelledby="grp-raw-heading">
          <h3 id="grp-raw-heading">The raw spread behind the statistics</h3>
          <p className="muted small">Each dot is one recording (one resident mouse). Solid line = group mean, dashed line = group median.</p>
          <div className="pharm-legend" aria-label="Groups">
            {GROUPS.map((g, i) => (
              <span key={g} className="pharm-legend__item">
                <span className="pharm-legend__swatch" style={{ background: `var(--grp-${i})` }} aria-hidden="true" />
                {GROUP_LABEL[g]}
              </span>
            ))}
          </div>
          {BEHAVIOR_SPECS.map((b) => (
            <div key={b.key} className="grp-behavior">
              <h4>
                {b.title} <span className="muted grp-behavior__gloss">{b.gloss}</span>
              </h4>
              <div className="pharm-grid-charts">
                {KINDS.map((k) => (
                  <GroupStripChart key={k.key} metric={stats.metrics[metricKey(b.key, k.key)]} title={k.title} unit={k.short} />
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>

      <section className="card">
        <details>
          <summary>Group summary table</summary>
          <div className="grp-table-scroll">
            <table className="pharm-table">
              <caption className="visually-hidden">Per-group mean, median and number of recordings with no bout, for each metric</caption>
              <thead>
                <tr>
                  <th scope="col">Behavior and metric</th>
                  <th scope="col">Group</th>
                  <th scope="col">n</th>
                  <th scope="col">Mean</th>
                  <th scope="col">Median</th>
                  <th scope="col">Recordings with none</th>
                </tr>
              </thead>
              <tbody>
                {BEHAVIOR_SPECS.flatMap((b) =>
                  KINDS.flatMap((k) =>
                    GROUPS.map((g) => {
                      const s = stats.metrics[metricKey(b.key, k.key)].groups[g]
                      return (
                        <tr key={`${b.key}-${k.key}-${g}`}>
                          <th scope="row">
                            {b.title}, {k.title.toLowerCase()} ({k.short})
                          </th>
                          <td>{GROUP_LABEL[g]}</td>
                          <td>{s.n}</td>
                          <td>{s.mean.toFixed(2)}</td>
                          <td>{s.median.toFixed(2)}</td>
                          <td>{s.n_zero}</td>
                        </tr>
                      )
                    }),
                  ),
                )}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <p className="muted pharm-attribution">
        Data: {stats.dataset.citation}{' '}
        <a href={stats.dataset.doi} target="_blank" rel="noreferrer">
          {stats.dataset.doi}
        </a>
        . Recordings contributed by {stats.dataset.contributing_lab}. Licensed {stats.dataset.license}. Metrics and statistics shown here
        are our own computation from that data, not the original authors&rsquo; analysis.
      </p>
    </div>
  )
}
