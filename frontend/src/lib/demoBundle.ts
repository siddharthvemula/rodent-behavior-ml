import type { CompareOutcome, PredictOutcome } from '../api/types'
import { clipById, demoCompareIntervals, demoCompareResult, type DemoClip, type DemoClips } from './demoClips'
import { demoClips } from './demoData'
import { buildDemoScript, type DemoStep } from './demoScript'
import { doseResponse } from './doseResponse'
import { modelMetrics } from './modelMetrics'
import { DEMO_NAMES, type RecordingNames } from './recordingNames'

/**
 * Everything the guided demo needs that comes from data: the wording (built from the data), the precomputed results,
 * and the clip names. Importing this module parses the committed data files, so it is loaded only when the guide
 * opens (lib/useDemoBundle.ts). Nothing in the main bundle may import it statically; a test enforces that.
 */
export interface DemoBundle {
  readonly script: readonly DemoStep[]
  readonly clips: DemoClips
  readonly predictFor: (id: DemoClip['id']) => PredictOutcome
  readonly compare: CompareOutcome
  readonly names: RecordingNames
}

export const demoBundle: DemoBundle = {
  script: buildDemoScript({ clips: demoClips, metrics: modelMetrics, stats: doseResponse }),
  clips: demoClips,
  predictFor: (id) => ({ segments: clipById(demoClips, id).predictions, warnings: [] }),
  compare: {
    result: demoCompareResult(demoClips),
    warnings: [],
    durations: { control: demoClips.clips[0].source.seconds, treated: demoClips.clips[1].source.seconds },
    intervals: demoCompareIntervals(demoClips),
  },
  names: DEMO_NAMES,
}
