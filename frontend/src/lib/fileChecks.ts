// Cheap browser-side checks so an obviously unusable file fails instantly with
// a clear message instead of after an upload. The backend re-validates
// everything (HARDENING_PLAN.md); these only save the user a round trip.

/** Mirrors backend MAX_UPLOAD_BYTES (4 MiB per file). */
export const MAX_FILE_BYTES = 4 * 1024 * 1024
/** Vercel caps a whole request body at 4.5 MB, so two files must fit together, not just individually. */
export const MAX_COMBINED_BYTES = 4_300_000

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v']
const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`

function extension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/** A user-facing problem with this one file, or null if it looks fine. */
export function checkKeypointsFile(file: File): string | null {
  const ext = extension(file.name)
  if (file.size === 0) return `${file.name} is empty.`
  if (VIDEO_EXTENSIONS.includes(ext)) {
    return `${file.name} is a video. Only pre-extracted pose keypoints (JSON) are supported; raw video can't be classified yet.`
  }
  if (ext === 'csv') return `${file.name} is a CSV. CSV pose files aren't supported; upload keypoints JSON.`
  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} is ${mb(file.size)}, over the 4 MB limit. Trim the clip (about 3.5 minutes of keypoints JSON fits).`
  }
  return null
}

/** A problem with the pair taken together (Compare), or null. */
export function checkFilePair(a: File, b: File): string | null {
  if (a.size + b.size > MAX_COMBINED_BYTES) {
    return `Together these files are ${mb(a.size + b.size)}; the upload limit is about ${mb(MAX_COMBINED_BYTES)} for both. Trim one or both clips.`
  }
  return null
}

export function isSameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified
}
