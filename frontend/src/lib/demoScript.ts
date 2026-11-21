import { behaviorInfo } from './behaviorInfo'
import { clipById, demoCompareResult, disagreementSpans, type DemoClip, type DemoClips } from './demoClips'
import { PRIMARY_SPECS, primaryMetric, summarizeComparisons, type DoseResponse } from './doseResponse'
import { weakestBehavior, type ModelMetrics } from './modelMetrics'
import { summarizeComparison } from './summary'
import { DEMO_FLOW, type DemoFlowStep, type DemoTab } from './demoFlow'

/**
 * The guided demo, as data: eight steps, about five minutes. Every number the presenter says is built from the
 * committed data files (precomputed predictions and annotations, model metrics, dose-response statistics), so the
 * script cannot drift from what the screen shows. Every step carries a caveat: a step cannot be added without
 * saying what it does not show.
 *
 * Clips are only ever called "Clip A" and "Clip B", and the text never frames them as an experiment's groups.
 */
export type { DemoTab }

export interface DemoStep extends DemoFlowStep {
  readonly title: string
  readonly say: readonly string[]
  /** What this step does NOT show. Required. */
  readonly caveat: string
}

interface StepText {
  readonly title: string
  readonly say: readonly string[]
  readonly caveat: string
}

export interface DemoInputs {
  readonly clips: DemoClips
  readonly metrics: ModelMetrics
  readonly stats: DoseResponse
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const title = (label: string) => behaviorInfo(label).title.toLowerCase()

/** The behavior the model most often calls something else, for a true behavior: "mixes it up with X". */
export function mostConfusedWith(metrics: ModelMetrics, label: string): string | null {
  const i = metrics.labels.indexOf(label)
  if (i < 0) return null
  let best = -1
  metrics.confusion[i].forEach((v, j) => {
    if (j !== i && (best < 0 || v > metrics.confusion[i][best])) best = j
  })
  return best < 0 ? null : metrics.labels[best]
}

export function buildDemoScript({ clips, metrics, stats }: DemoInputs): DemoStep[] {
  const a = clipById(clips, 'clip_a')
  const b = clipById(clips, 'clip_b')
  const aSlot = (label: string) => a.agreement.time_share_predicted[label] ?? 0
  const aTrue = (label: string) => a.agreement.time_share_annotated[label] ?? 0
  const bDisagree = disagreementSpans(b).reduce((s, x) => s + (x.end - x.start), 0) / b.source.seconds
  const f1 = (c: DemoClip, label: string) => c.agreement.per_class_f1[label] ?? null
  const bInvF1 = f1(b, 'investigation')
  const bAtkF1 = f1(b, 'attack')
  const weakest = weakestBehavior(metrics) ?? 'attack'
  const confused = mostConfusedWith(metrics, weakest)
  // The comparison step narrates the same "biggest change" the screen's headline shows (same function), not a
  // behavior of our own choosing, so the card and the hero number can never disagree.
  const compare = summarizeComparison(demoCompareResult(clips))
  const lead = compare.lead
  const signed = (v: number) => `${v < 0 ? '\u2212' : '+'}${Math.abs(Math.round(v * 100))}`
  const leadRange = lead ? clips.compare_intervals.difference[lead.label] : null
  const spec = (k: string) => PRIMARY_SPECS.find((s) => s.key === k)!
  const sentence = (k: 'distance_arena_widths' | 'immobility_pct') => `${spec(k).title}: ${summarizeComparisons(primaryMetric(stats, k), spec(k))}`

  const text: Record<string, StepText> = {
    intro: {
      title: 'Scoring behavior by hand does not scale',
      say: [
        'Researchers label social behavior in video by hand. It is slow, and different people draw the lines in different places.',
        'This tool reads the pose keypoints of two mice and labels each moment as attack, investigation, mount or other.',
      ],
      caveat: 'A research demo of automated scoring. It does not diagnose anything, and it is not evidence that any intervention works.',
    },
    timeline: {
      title: 'A behavior timeline from pose data',
      say: [
        `Clip A is ${Math.round(a.source.seconds)} seconds of a recording the model never trained on.`,
        `The model spends ${pct(aSlot('investigation'))} of it on investigation and ${pct(aSlot('mount'))} on mount. The human annotators had ${pct(aTrue('investigation'))} and ${pct(aTrue('mount'))}.`,
        'Hover the strip to see each bout and how confident the model was.',
      ],
      caveat: 'One short clip, shown as an example. The overall accuracy is on the “How much to trust it” step.',
    },
    confidence: {
      title: 'It shows where it is unsure',
      say: [
        'The Detail view adds a confidence lane under the timeline.',
        'Low-confidence stretches are hatched on the strip: those are the ones worth a human look.',
      ],
      caveat: 'Confidence is the model’s own estimate. It is not a measured error rate.',
    },
    agreement: {
      title: 'Checked against human annotators',
      say: [
        `Clip B is the attack-heavy clip: ${pct(b.agreement.time_share_annotated.attack ?? 0)} of it is annotated as attack.`,
        `Frame accuracy is ${pct(b.agreement.accuracy)}. Attack scores ${bAtkF1 === null ? 'n/a' : bAtkF1.toFixed(2)}, but investigation only ${bInvF1 === null ? 'n/a' : bInvF1.toFixed(2)}.`,
        `The striped lane marks the ${pct(bDisagree)} of the clip where the model and the annotators disagree.`,
      ],
      caveat: 'Mount never occurs in this clip, so it has no score. One 100 second clip says little about overall accuracy.',
    },
    compare: {
      title: 'Comparing two recordings',
      say: [
        lead && leadRange
          ? `The same classifier runs on both clips. The biggest change is ${title(lead.label)}: ${pct(lead.control)} of Clip A, ${pct(lead.treated)} of Clip B (${signed(lead.difference)} points; 95% interval ${signed(leadRange[0])} to ${signed(leadRange[1])}).`
          : 'The same classifier runs on both clips.',
        ...(compare.alsoNoted ? [compare.alsoNoted] : []),
        'The whiskers show how stable each clip’s own estimate is, not whether two animals differ.',
      ],
      caveat: 'Clip A and Clip B are two arbitrary recordings, not groups from an experiment. This view does not measure the effect of anything.',
    },
    trust: {
      title: 'How much to trust it',
      say: [
        `On ${metrics.nTest} recordings never used for training, the overall score is ${metrics.macroF1.toFixed(2)} out of 1.00.`,
        `The weakest behavior is ${title(weakest)} (${metrics.f1[weakest].toFixed(2)})${confused ? `, which the model mixes up mostly with ${title(confused)}` : ''}.`,
      ],
      caveat: `With only ${metrics.nTest} test recordings, the true score could plausibly be a few points higher or lower.`,
    },
    pharmacology: {
      title: 'A separate dataset: dose and movement',
      say: [
        'Different data, and no classifier here: real yohimbine dose groups, 32 mice, measured from tracked body position.',
        sentence('distance_arena_widths'),
        sentence('immobility_pct'),
      ],
      caveat: 'These statistics describe these 32 mice only. With 8 per group only large effects can be detected, so “not significant” does not mean “no effect”.',
    },
    close: {
      title: 'What to take away',
      say: [
        'Automated behavior scoring that shows its confidence and its mistakes.',
        'Richer features improved cross-validation by about 0.01. Tuning, class weights, smoothing variants and a sequence model did not help.',
        `${title(weakest)[0].toUpperCase()}${title(weakest).slice(1)} is the weakest behavior and the place to improve first.`,
      ],
      caveat: 'Research output on public data: CalMS21 for the classifier and the yohimbine open-field set for the dose groups, both CC BY 4.0.',
    },
  }
  return DEMO_FLOW.map((flow) => ({ ...flow, ...text[flow.id] }))
}
