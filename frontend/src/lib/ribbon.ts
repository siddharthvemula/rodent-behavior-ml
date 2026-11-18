// Which timeline segment is under the pointer? Segments tile the strip, so
// "the one containing x" is exact, but thin segments (a 0.6 s bout is a couple
// of pixels wide) are nearly impossible to land on. So each segment narrower
// than `minHit` gets an effective hit zone of `minHit` centered on it, and the
// pointer picks the nearest such zone it is inside. Done by position rather
// than with overlapping hit boxes, because overlapping boxes steal their
// neighbors' edges.

export interface PixelSpan {
  readonly start: number
  readonly end: number
}

export const MIN_HIT_PX = 14

export function pickSegment(x: number, spans: readonly PixelSpan[], minHit = MIN_HIT_PX): number | null {
  if (spans.length === 0 || !Number.isFinite(x)) return null

  let thin = -1
  let thinDistance = Infinity
  let containing = -1
  spans.forEach((span, i) => {
    if (x >= span.start && x < span.end) containing = i
    const width = span.end - span.start
    if (width >= minHit) return
    const reach = (minHit - width) / 2
    const distance = x < span.start ? span.start - x : x > span.end ? x - span.end : 0
    if (distance <= reach && distance < thinDistance) {
      thin = i
      thinDistance = distance
    }
  })

  if (thin >= 0) return thin
  if (containing >= 0) return containing
  return x < spans[0].start ? 0 : spans.length - 1 // pointer at or just past the strip's edge
}
