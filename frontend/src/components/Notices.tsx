interface NoticesProps {
  readonly notes: readonly string[]
}

/** Non-blocking notes about the input (repairs, suspicious values). The result is still shown. */
export function Notices({ notes }: NoticesProps) {
  if (notes.length === 0) return null
  return (
    <aside className="notices" aria-label="Notes about this recording">
      <strong>Heads up</strong>
      <ul>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </aside>
  )
}
