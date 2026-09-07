/**
 * At-a-glance summaries for collapsed metric sections.
 *
 * A collapsed section used to show a chevron, a label and a count of hidden
 * charts — no values at all. Collapsing therefore *hid* information rather
 * than summarising it, which is why every group shipped expanded and the
 * screen felt overwhelming.
 *
 * The old Task Manager model is the right one: a collapsed row still answers
 * "is this area OK?" without being opened. That needs two things per group —
 * a couple of headline figures, and a small bar chart showing recent shape.
 * Both are computed here, as pure functions over the points the page has
 * already fetched, so no extra query and no charting library is involved.
 */

/** A single bar in a collapsed section's mini chart: `null` is a gap, never zero. */
export type SummaryBar = number | null

/**
 * Reduce a series to `bucketCount` bars scaled 0..1.
 *
 * Buckets average the samples that fall in them, so the bar shape tracks the
 * series rather than whichever sample happened to land on a boundary. A
 * bucket with no finite sample stays `null` and renders as a gap — the same
 * "missing is not zero" discipline the charts themselves use.
 *
 * `max` fixes the scale for bounded metrics (percentages pass `100`) so two
 * servers' bars are comparable. Unbounded metrics (bytes/s) omit it and
 * self-scale to their own peak, which is the only meaningful choice without
 * a known ceiling.
 */
export function summaryBars(
  values: readonly (number | null | undefined)[],
  bucketCount = 8,
  max?: number
): SummaryBar[] {
  if (bucketCount <= 0) return []
  if (values.length === 0) return Array.from({ length: bucketCount }, () => null)

  const buckets: SummaryBar[] = []
  for (let index = 0; index < bucketCount; index += 1) {
    const start = Math.floor((index * values.length) / bucketCount)
    const end = Math.max(start + 1, Math.floor(((index + 1) * values.length) / bucketCount))
    let sum = 0
    let count = 0
    for (let i = start; i < end && i < values.length; i += 1) {
      const value = values[i]
      if (typeof value === 'number' && Number.isFinite(value)) {
        sum += value
        count += 1
      }
    }
    buckets.push(count > 0 ? sum / count : null)
  }

  const ceiling =
    max ??
    buckets.reduce<number>((peak, bar) => (bar !== null && bar > peak ? bar : peak), 0)
  if (ceiling <= 0) {
    // Everything is zero (or the series is empty): flat floor, not a
    // divide-by-zero and not a row of nulls, since zero is a real reading.
    return buckets.map((bar) => (bar === null ? null : 0))
  }
  return buckets.map((bar) => (bar === null ? null : Math.min(1, Math.max(0, bar / ceiling))))
}

/** Most recent finite value in a series, or `null` when it never reported. */
export function lastFiniteValue(
  values: readonly (number | null | undefined)[]
): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

/** Severity of a collapsed section's state chip. `null` means nothing is wrong and no chip shows. */
export type SummaryTone = 'warning' | 'critical' | null

/**
 * Threshold check for a collapsed section's chip.
 *
 * Only crossings produce a chip, so a healthy server shows a row of quiet
 * headers and anything that needs attention stands out without expanding
 * anything. A missing reading is not a crossing — absence is not a fault.
 */
export function summaryTone(
  value: number | null,
  thresholds: { warning: number; critical: number }
): SummaryTone {
  if (value === null || !Number.isFinite(value)) return null
  if (value >= thresholds.critical) return 'critical'
  if (value >= thresholds.warning) return 'warning'
  return null
}
