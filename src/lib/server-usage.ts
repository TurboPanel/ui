/** Distinct hues for stacked CPU modes — not online status green. */
export const CPU_USER = '#4dabf7'
export const CPU_SYSTEM = '#748ffc'
export const CPU_IOWAIT = '#fcc419'

function finiteOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return value
}

export function clampPercent(value: number | null | undefined): number | null {
  const n = finiteOrNull(value)
  if (n == null) return null
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}

export function formatPercent(value: number | null): string {
  if (value == null) return '—'
  return `${Math.round(value)}%`
}

export function finiteMetric(value: number | null | undefined): number | null {
  return finiteOrNull(value)
}

/**
 * Used % from a capacity pair — `(total − free) / total`. Some v4 host
 * fields (e.g. `host.memory.availableBytes`) are still raw measurements
 * without a stored total; call sites that have a topology-derived total use
 * this, everything else reads the server-computed `derived.*` percent
 * directly instead of re-deriving it client-side.
 */
export function usedPercentFromBytes(
  totalBytes: number | null | undefined,
  freeBytes: number | null | undefined
): number | null {
  const total = finiteOrNull(totalBytes)
  const free = finiteOrNull(freeBytes)
  if (total == null || free == null || total <= 0) return null
  return clampPercent(((total - free) / total) * 100)
}

export type UsageMetricInput = Readonly<{
  cpuBusyPercent?: number | null
  /** Derived server-side (`DerivedHostValues.memoryUsedPercent`). */
  memoryPercent?: number | null
  /** Derived server-side (`DerivedHostValues.swapUsedPercent`). */
  swapPercent?: number | null
}>

/** True when any displayed usage metric has arrived (zero counts as a sample). */
export function hasUsageMetrics(input: UsageMetricInput): boolean {
  return [input.cpuBusyPercent, input.memoryPercent, input.swapPercent].some(
    (value) => finiteOrNull(value) != null
  )
}
