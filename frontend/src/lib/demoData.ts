import raw from '../data/demo_clips.json'
import { parseDemoClips, type DemoClips } from './demoClips'

/** The validated committed demo data. Importing this parses the file, so only the lazily loaded demo bundle does. */
export const demoClips: DemoClips = parseDemoClips(raw)
