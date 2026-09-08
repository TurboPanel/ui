import { formatLocalDateTime } from '@/lib/format-datetime'

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const

function formatScaled(value: number, units: readonly string[], divisor: number): string {
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
  unit: TemperatureUnit
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null
  }
  return unit === 'fahrenheit' ? (value * 9) / 5 + 32 : value
}

/** Unit-aware temperature formatter — layers on {@link celsiusToDisplay}. */
export function formatCelsiusAs(value: number | null | undefined, unit: TemperatureUnit): string {
  const displayValue = celsiusToDisplay(value, unit)
  if (displayValue === null) return '—'
  return unit === 'fahrenheit' ? `${displayValue.toFixed(1)} °F` : `${displayValue.toFixed(1)} °C`
}

export function formatWatts(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  const abs = Math.abs(value)
  // Sub-50 mW RAPL samples (idle Intel PP1) round to "0.0 W" at one decimal
  // and collapse the Y-axis to identical tick labels.
  if (abs > 0 && abs < 0.05) {
    return `${(value * 1000).toFixed(1)} mW`
  }
  return `${value.toFixed(1)} W`
}

/**
 * Unit-aware axis/label suffix for a physical signal — `hardwareSignals[].unit`
 * is a free-form discriminator (`celsius`/`watts`/`rpm`/`percent`/other), not a
 * fixed enum, so anything unrecognized just renders as-is.
 */
export function physicalSignalUnitLabel(unit: string, temperatureUnit: TemperatureUnit): string {
  if (unit === 'celsius') return temperatureUnit === 'fahrenheit' ? '°F' : '°C'
  if (unit === 'watts') return 'W'
  if (unit === 'rpm') return 'RPM'
  if (unit === 'percent') return '%'
  return unit
}

const CPU_PACKAGE_POWER_SIGNAL_RE = /:package-\d+$/i
const CPU_PACKAGE_TEMP_SIGNAL_RE = /Package id \d+$/i

/**
 * Operator chart title for a physical signal. Kernel hwmon/RAPL names
 * (`Package id 0`, `package-0`) stay in `signalId`; do not show them as titles.
 */
export function hardwareSignalDisplayTitle(signal: {
  signalId: string
  kind: string
  label: string
}): string {
  if (signal.kind === 'power' && CPU_PACKAGE_POWER_SIGNAL_RE.test(signal.signalId)) {
    return 'CPU package power'
  }
  if (signal.kind === 'temperature' && CPU_PACKAGE_TEMP_SIGNAL_RE.test(signal.signalId)) {
    return 'CPU package temperature'
  }
  if (signal.label === 'package-0') return 'CPU package power'
  if (/^Package id \d+$/i.test(signal.label)) return 'CPU package temperature'
  return signal.label || signal.signalId
}

/** Unit-aware value formatter for a physical signal — see {@link physicalSignalUnitLabel}. */
export function formatPhysicalSignalValue(
  value: number | null | undefined,
  unit: string,
  temperatureUnit: TemperatureUnit
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  switch (unit) {
    case 'celsius':
      return formatCelsiusAs(value, temperatureUnit)
    case 'watts':
      return formatWatts(value)
    case 'rpm':
      return `${formatCount(value)} RPM`
    case 'percent':
      return formatPercent(value)
    default:
      return formatCount(value)
  }
}

export function formatMilliseconds(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ms`
}

/**
 * CPU busy % — the v5 contract stores `host.cpu.busyPercent` directly
 * (computed server-side from `1 − idle`), so this is a clamping passthrough,
 * not a derivation. Kept as a named helper so call sites read the same as
 * they did pre-cutover.
 */
export function cpuBusyPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null
  }
  return Math.min(100, Math.max(0, value))
}

export function formatCpuBusyPercent(value: number | null | undefined): string {
  return formatPercent(cpuBusyPercent(value))
}

export function formatUptimeSeconds(value: number | null | undefined): string {
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

/**
 * A duration that may be short — `42s`, `3m 10s`, `2h 5m`, `1d 3h`. Unlike
 * `formatUptimeSeconds` it keeps seconds under a minute, so a config reload
 * from moments ago reads as fresh rather than `0m`.
 */
export function formatDurationSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  const totalSeconds = Math.max(0, Math.floor(value))
  if (totalSeconds < 60) return `${totalSeconds}s`
  if (totalSeconds < 3600) return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`
  return formatUptimeSeconds(totalSeconds)
}

export type MetricsRangeId = '5m' | '10m' | '1h' | '6h' | '24h' | '7d' | '30d' | '90d'

/** Compact x-axis label: time-only for short ranges, date for long ranges. */
export function formatAxisTime(ms: number, rangeId: MetricsRangeId): string {
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

export function formatCoveragePercent(presentSamples: number, expectedSamples: number): string {
  if (expectedSamples <= 0) return '—'
  // Coverage is grid fill rate, not raw AE SUM(_sample_interval). Extra samples
  // in one bucket must not push coverage above 100% or past (expected - gaps).
  const present = Math.max(0, Math.min(presentSamples, expectedSamples))
  const pct = (present / expectedSamples) * 100
  if (!Number.isFinite(pct)) return '—'
  return `${pct.toFixed(1)}%`
}

/** Slots on the resolution grid that have at least the expected samples. */
export function presentSamplesFromGaps(expectedSamples: number, gapCount: number): number {
  if (expectedSamples <= 0) return 0
  return Math.max(0, expectedSamples - Math.max(0, gapCount))
}

/**
 * Average queue depth (`aqu-sz`) — a dimensionless count of requests in
 * flight, not a percentage and not a pending-operation count.
 *
 * The collector computes it correctly (Δ`time_in_queue` over the interval,
 * the same figure `iostat -x` reports), but on an idle-to-moderate host it
 * genuinely sits between 0.001 and 0.2 and only exceeds 1 under real
 * queuing. Rendered with the shared integer count formatter it read as a
 * flat zero with visible noise — "always 0 but wavy". Three decimals below 1
 * is what makes the series legible.
 */
export function formatQueueDepth(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  if (value >= 10) return value.toFixed(0)
  if (value >= 1) return value.toFixed(2)
  return value.toFixed(3)
}
