import { formatLocalDateTime } from '@/lib/format-datetime'

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const

function formatScaled(
  value: number,
  units: readonly string[],
  divisor: number,
): string {
  if (!Number.isFinite(value)) return '—'
  let scaled = value
  let unitIndex = 0
  while (Math.abs(scaled) >= divisor && unitIndex < units.length - 1) {
    scaled /= divisor
    unitIndex += 1
  }
  let digits: number
  if (scaled >= 100) {
    digits = 0
  } else if (scaled >= 10) {
    digits = 1
  } else {
    digits = 2
  }
  return `${scaled.toFixed(digits)} ${units[unitIndex]}`
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  return `${value.toFixed(1)}%`
}

export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  return formatScaled(value, BYTE_UNITS, 1024)
}

export function formatBytesPerSecond(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  return `${formatScaled(value, BYTE_UNITS, 1024)}/s`
}

export function formatOpsPerSecond(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k ops/s`
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ops/s`
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 10_000) {
    return `${(value / 1000).toFixed(1)}k`
  }
  return String(Math.round(value))
}

export function formatUptimeSeconds(
  value: number | null | undefined,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  const totalSeconds = Math.max(0, Math.floor(value))
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (days > 0) {
    return `${days}d ${hours}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

export type MetricsRangeId =
  | '1h'
  | '6h'
  | '24h'
  | '7d'
  | '30d'
  | '90d'

/** Compact x-axis label: time-only for short ranges, date for long ranges. */
export function formatAxisTime(
  ms: number,
  rangeId: MetricsRangeId,
): string {
  const shortRange = rangeId === '1h' || rangeId === '6h' || rangeId === '24h'
  return formatLocalDateTime(ms, {
    includeDate: !shortRange,
    includeSeconds: false,
    timeZoneName: undefined,
  })
}

export function formatCoveragePercent(
  presentSamples: number,
  expectedSamples: number,
): string {
  if (expectedSamples <= 0) return '—'
  // Coverage is grid fill rate, not raw AE SUM(_sample_interval). Extra samples
  // in one bucket must not push coverage above 100% or past (expected - gaps).
  const present = Math.max(0, Math.min(presentSamples, expectedSamples))
  const pct = (present / expectedSamples) * 100
  if (!Number.isFinite(pct)) return '—'
  return `${pct.toFixed(1)}%`
}

/** Slots on the resolution grid that have at least the expected samples. */
export function presentSamplesFromGaps(
  expectedSamples: number,
  gapCount: number,
): number {
  if (expectedSamples <= 0) return 0
  return Math.max(0, expectedSamples - Math.max(0, gapCount))
}
