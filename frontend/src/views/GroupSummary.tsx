import { CountUpOnView } from '../components/CountUpOnView'
import { GroupStripChart } from '../components/GroupStripChart'
import { Hero, HeroStat } from '../components/Hero'
import { GROUP_LABEL, familyOutcome, isSignificant, type GroupComparison } from '../lib/groupComparison'

/**
 * The one behavior the Summary charts. It is a fixed choice (attacking is what a resident-intruder test is mainly
 * about), never picked from the results: charting whichever comparison came closest would present chance as a finding.
 */
const SUMMARY_METRIC = 'attack_time_pct'

interface Props {
  readonly stats: GroupComparison
  readonly onShowDetail?: () => void
}

/** One headline, one sentence, one chart, in everyday words. Everything else is in the Detail view. */
export function GroupSummary({ stats, onShowDetail }: Props) {
  const out = familyOutcome(stats)
  const sentence =
    out.significant === 0
      ? `None of ${out.total} comparisons with naive mice showed a clear difference, but groups this small could miss a real one`
      : `${out.significant} of ${out.total} comparisons with naive mice showed a clear difference`
  const metric = stats.metrics[SUMMARY_METRIC]
  const clear = metric.comparisons.filter((c) => isSignificant(c, stats.design.alpha)).map((c) => GROUP_LABEL[c.group].toLowerCase())

  return (
    <div className="pharm grp pharm--summary">
      <p className="banner banner--real" role="note">
        <strong>Real data, human annotations.</strong> One lab&rsquo;s resident&ndash;intruder recordings from{' '}
        <a href={stats.dataset.url} target="_blank" rel="noreferrer">
          DANDI 000564
        </a>{' '}
        ({stats.dataset.license}).
      </p>

      <Hero
        label="finding"
        color="var(--accent)"
        eyebrow="Key finding · each group vs naive"
        headline={sentence}
        stat={
          <HeroStat label="Clear differences" unit={`of ${out.total}`} caption="comparisons with naive mice" spoken={`${out.significant} of ${out.total} comparisons`}>
            <CountUpOnView value={out.significant} />
          </HeroStat>
        }
      >
        {sentence}
      </Hero>

      <section className="card summary-chart" aria-labelledby="grp-summary-chart">
        <h3 id="grp-summary-chart">Attacking, the main behavior in this kind of test</h3>
        <p className="muted small">
          Each dot is one mouse; the solid line is the group average and the dashed line is the middle value.
        </p>
        <GroupStripChart metric={metric} title="Time spent attacking" unit="% of session" countNoun="mice" />
        {/* For readers who go straight to the chart: it says on its own that a visible gap is not a finding. */}
        <p className="summary-chart__caveat" data-testid="chart-caveat">
          {clear.length === 0
            ? 'No gap here is a confirmed difference from naive mice, even if it looks large.'
            : `Only these are confirmed differences from naive mice: ${clear.join(', ')}.`}{' '}
          See Detail for the full analysis.
        </p>
      </section>

      {onShowDetail && (
        <button type="button" className="link-button" onClick={onShowDetail}>
          See all behaviors, groups and the methods in the Detail view →
        </button>
      )}

      <p className="muted pharm-attribution">
        Data: {stats.dataset.citation}{' '}
        <a href={stats.dataset.doi} target="_blank" rel="noreferrer">
          {stats.dataset.doi}
        </a>
        . Recordings contributed by {stats.dataset.contributing_lab}. Licensed {stats.dataset.license}. The numbers shown here are our
        own computation from that data, not the original authors&rsquo; analysis.
      </p>
    </div>
  )
}
