import { CountUpOnView } from '../components/CountUpOnView'
import { EffectForest } from '../components/EffectForest'
import { Hero, HeroStat } from '../components/Hero'
import { PRIMARY_SPECS, effectAxis, forestRows, primaryMetric, type DoseResponse } from '../lib/doseResponse'
import type { OpenFieldData } from '../lib/openField'
import { leadDoseEffect } from '../lib/pharmFindings'

interface Props {
  readonly data: OpenFieldData
  readonly stats: DoseResponse
  readonly onShowDetail?: () => void
}

/** One headline, one sentence, one chart, in everyday words. Everything else is in the Detail view. */
export function PharmacologySummary({ data, stats, onShowDetail }: Props) {
  const lead = leadDoseEffect(stats)
  const spec = lead?.spec ?? PRIMARY_SPECS[0]
  const sentence = lead?.sentence ?? 'No dose clearly differed from saline, though groups this small could miss a real difference'

  return (
    <div className="pharm pharm--summary">
      <p className="banner banner--real" role="note">
        <strong>Real data.</strong> Yohimbine open-field pose tracking (
        <a href={data.dataset.url} target="_blank" rel="noreferrer">
          Zenodo 8188683
        </a>
        , {data.dataset.license}), {stats.power.n_per_group} mice per group.
      </p>

      <Hero
        label="finding"
        color="var(--accent)"
        eyebrow={`Key finding · ${spec.title.toLowerCase()}`}
        headline={sentence}
        stat={
          lead && (
            <HeroStat
              label="Biggest difference"
              unit={lead.statUnit}
              caption={`average ${spec.title.toLowerCase()}, ${lead.doseName} vs saline`}
              spoken={lead.spoken}
            >
              <CountUpOnView value={lead.size} format={(x) => `${lead.sign}${Math.round(x)}`} />
            </HeroStat>
          )
        }
      >
        {sentence}
      </Hero>

      <section className="card summary-chart" aria-labelledby="pharm-summary-chart">
        <h3 id="pharm-summary-chart">Each dose compared with saline</h3>
        <p className="muted small">
          The further a dot is from the middle line, the bigger the difference. The bar through it shows how uncertain that is. A
          filled dot marks a clear difference.
        </p>
        <EffectForest plain spec={spec} rows={forestRows(primaryMetric(stats, spec.key))} axis={effectAxis(stats)} />
      </section>

      {onShowDetail && (
        <button type="button" className="link-button" onClick={onShowDetail}>
          See every chart, number and the methods in the Detail view →
        </button>
      )}

      <p className="muted pharm-attribution">
        Data: {data.dataset.citation} Licensed {data.dataset.license}. The numbers shown here are our own computation from that data,
        not the original authors&rsquo; analysis.
      </p>
    </div>
  )
}
