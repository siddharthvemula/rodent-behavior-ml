// Shared timing for the Summary entrance sequence, so the CSS (which staggers
// cards) and the count-up numbers agree. One sequence, roughly 2 s end to end:
// hero -> stat tiles -> chart card -> rows -> bars/donut sweep -> standout pulse.

/** Index-based stagger for card-level entrances (see .enter in summary.css, 90 ms per step). */
export const ENTER_STEP_MS = 90

/** When the hero's big numbers start counting. */
export const HERO_COUNT_MS = 420

/** First chart row enters, then each following row. */
export const ROW_START_MS = 760
export const ROW_STEP_MS = 120

/** A row's bars start growing this long after the row itself appears. */
export const BAR_AFTER_ROW_MS = 200

export const rowDelay = (index: number) => ROW_START_MS + index * ROW_STEP_MS
export const barDelay = (index: number) => rowDelay(index) + BAR_AFTER_ROW_MS
