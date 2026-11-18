import { DoseStripChart } from '../components/DoseStripChart'
import { METRICS, groupByDose, mean, median, openField, type OpenFieldData } from '../lib/openField'

interface Props {
  readonly data?: OpenFieldData
}

/** Open-field pharmacology demo: yohimbine dose groups, real data, no classifier involved. */
export function PharmacologyView({ data = openField }: Props) {
  const groups = groupByDose(data.mice)

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

      <section className="card" aria-labelledby="pharm-heading">
        <h2 id="pharm-heading">Saline vs. yohimbine dose groups</h2>
        <p className="muted">
          Each dot is one mouse, so you can see the spread. Solid line = group mean, dashed line = group median. With
          only {groups[0]?.mice.length ?? 0} mice per group this is descriptive: no significance test is run and the
          page does not claim the differences are statistically established.
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
        </div>

        <p className="muted pharm-note">
          Units are pixels in the camera image. The data has no physical scale, so nothing here is converted to cm.
          Speed is per video frame. Average speed is total distance divided by time, so it closely mirrors distance.
        </p>
      </section>

      <section className="card">
        <details>
          <summary>Group summary and per-mouse table</summary>
          <table className="pharm-table">
            <caption className="visually-hidden">Per-group mean and median for each metric</caption>
            <thead>
              <tr>
                <th scope="col">Group</th>
                {METRICS.map((m) => (
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
                  {METRICS.map((m) => {
                    const v = g.mice.map((x) => x[m.key])
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
                {METRICS.map((m) => (
                  <th key={m.key} scope="col">
                    {m.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.mice.map((mouse) => (
                <tr key={mouse.id}>
                  <th scope="row">{mouse.id}</th>
                  <td>{groups.find((g) => g.dose === mouse.dose_mg_kg)?.label}</td>
                  {METRICS.map((m) => (
                    <td key={m.key}>{m.format(mouse[m.key])}</td>
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
              fewer are interpolated), and any single-frame move over {data.parameters.max_step_px} px is treated as a
              tracking jump and excluded.
            </li>
          </ul>
        </details>
      </section>

      <p className="muted pharm-attribution">
        Data: {data.dataset.citation} Licensed {data.dataset.license}. Metrics shown here are our own computation from
        that data, not the original authors' analysis.
      </p>
    </div>
  )
}
