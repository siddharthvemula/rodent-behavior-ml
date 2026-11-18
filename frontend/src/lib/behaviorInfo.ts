// Plain-language names for the fixed behavior vocabulary, for the Summary
// view. The backend only ever sends the label; wording lives here so the
// auto-generated sentences read naturally to a non-technical audience.

export interface BehaviorInfo {
  /** Short noun for headings: "Attack". */
  readonly title: string
  /** For sentences: "attacking" ("Attacking rose from…"). */
  readonly gerund: string
  /** One line for a tooltip/subtitle. */
  readonly description: string
}

const KNOWN: Readonly<Record<string, BehaviorInfo>> = {
  attack: { title: 'Attack', gerund: 'attacking', description: 'Aggressive contact with the other mouse' },
  investigation: {
    title: 'Investigation',
    gerund: 'investigating',
    description: 'Sniffing and exploring the other mouse',
  },
  mount: { title: 'Mounting', gerund: 'mounting', description: 'Climbing onto the other mouse' },
  other: { title: 'Other', gerund: 'other activity', description: 'Any other behavior' },
}

const capitalize = (text: string) => (text.length === 0 ? text : text[0].toUpperCase() + text.slice(1))

export function behaviorInfo(label: string): BehaviorInfo {
  return KNOWN[label] ?? { title: capitalize(label), gerund: label, description: '' }
}

export { capitalize }
