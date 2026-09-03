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

export function formatCelsius(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  return `${value.toFixed(1)} °C`
}

/** Organization-configured display unit for stored Celsius readings. */
export type TemperatureUnit = 'celsius' | 'fahrenheit'

/**
 * Convert a stored Celsius reading to the display unit. `null`/non-finite
 * input stays `null` — never coerced to `0`. Comparisons against a limit
 * (Tjmax/TDP headroom) must always happen in Celsius/Watts *before* calling
 * this — it is a render-time conversion only.
 */
export function celsiusToDisplay(
  value: number | null | undefined,
  unit: TemperatureUnit,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null
  }
  return unit === 'fahrenheit' ? (value * 9) / 5 + 32 : value
}

/** Unit-aware temperature formatter — layers on {@link celsiusToDisplay}. */
export function formatCelsiusAs(
  value: number | null | undefined,
  unit: TemperatureUnit,
): string {
  const displayValue = celsiusToDisplay(value, unit)
  if (displayValue === null) return '—'
  return unit === 'fahrenheit'
    ? `${displayValue.toFixed(1)} °F`
    : `${displayValue.toFixed(1)} °C`
}

export function formatWatts(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  return `${value.toFixed(1)} W`
}

export function formatMilliseconds(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ms`
}

/**
 * CPU busy % derived from stored idle — the v2 contract keeps no
 * `cpuUsagePercent`; this is the single place it is computed.
 */
export function derivedCpuBusyPercent(
  cpuIdlePercent: number | null | undefined,
): number | null {
  if (
    cpuIdlePercent === null ||
    cpuIdlePercent === undefined ||
    !Number.isFinite(cpuIdlePercent)
  ) {
    return null
  }
  return Math.min(100, Math.max(0, 100 - cpuIdlePercent))
}

export function formatDerivedCpuBusyPercent(
  cpuIdlePercent: number | null | undefined,
): string {
  return formatPercent(derivedCpuBusyPercent(cpuIdlePercent))
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
  | '5m'
  | '10m'
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
  const shortRange =
    rangeId === '5m' ||
    rangeId === '10m' ||
    rangeId === '1h' ||
    rangeId === '6h' ||
    rangeId === '24h'
  // Omit zone — gifted-charts clips each tick to ~point spacing; "1:05 PM CDT"
  // collapses to "1" on a 60-point 1h chart.
  return formatLocalDateTime(ms, {
    includeDate: !shortRange,
    includeSeconds: false,
    timeZoneName: null,
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
