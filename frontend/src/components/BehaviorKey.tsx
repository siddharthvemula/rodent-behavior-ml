import { behaviorInfo } from '../lib/behaviorInfo'

interface BehaviorKeyProps {
  readonly labels: readonly string[]
  readonly colors: Readonly<Record<string, string>>
  readonly active: string | null
  readonly onActiveChange: (label: string | null) => void
}

/** Color key (dot + name) shared by the donuts and the timeline; hovering a name highlights that behavior. */
export function BehaviorKey({ labels, colors, active, onActiveChange }: BehaviorKeyProps) {
  return (
    <ul className="donut-key" aria-hidden="true">
      {labels.map((label) => (
        <li
          key={label}
          className={active === label ? 'is-active' : ''}
          onPointerEnter={() => onActiveChange(label)}
          onPointerLeave={() => onActiveChange(null)}
        >
          <span className="donut-key__dot" style={{ background: colors[label] }} />
          {behaviorInfo(label).title}
        </li>
      ))}
    </ul>
  )
}
