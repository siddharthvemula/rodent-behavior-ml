import { createContext, useContext } from 'react'

/**
 * What the two compared recordings are called on screen. Normally "Recording A" and "Recording B"; the guided demo
 * calls them "Clip A" and "Clip B". The wording never implies an experiment (no group labels).
 */
export interface RecordingNames {
  readonly a: string
  readonly b: string
}

export const DEFAULT_NAMES: RecordingNames = { a: 'Recording A', b: 'Recording B' }
export const DEMO_NAMES: RecordingNames = { a: 'Clip A', b: 'Clip B' }

export const RecordingNamesContext = createContext<RecordingNames>(DEFAULT_NAMES)
export const useRecordingNames = () => useContext(RecordingNamesContext)

/** "Recording A" -> "recording A", for mid-sentence use. */
export const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
/** "Recording B" -> "B", for "recording A → B". */
export const tail = (s: string) => s.slice(s.lastIndexOf(' ') + 1)
