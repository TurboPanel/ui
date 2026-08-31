/** Distinct hues for stacked CPU modes — not online status green. */
export const CPU_USER = '#4dabf7'
export const CPU_SYSTEM = '#748ffc'
export const CPU_OTHER = '#9775fa'
export const CPU_IOWAIT = '#fcc419'
export const LOAD_FILL = '#63e6be'

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

export function formatLoad(value: number | null): string {
  if (value == null) return '—'
  return value >= 10 ? value.toFixed(1) : value.toFixed(2)
}

/**
 * Normalize load average to percent of capacity for a bar fill.
 * 100% = 1.0 load unit per core (fully busy).
 */
export function loadPercentOfCores(
  load: number | null | undefined,
  cpuCores: number | null | undefined,
): number | null {
  const l = finiteOrNull(load)
  const cores = finiteOrNull(cpuCores)
  if (l == null || cores == null || cores <= 0) return null
  return clampPercent((l / cores) * 100)
}

export type CpuStackSegments = {
  user: number
  system: number
  other: number
  iowait: number
}

/**
 * Build a 0–100 stacked breakdown: user, system, residual active (irq/steal),
 * and iowait. Idle is the unfilled track.
 */
export function buildCpuStackSegments(input: {
  /** Derived busy % (`100 − cpuIdlePercent`) — includes iowait. */
  usage?: number | null
  user?: number | null
  system?: number | null
  iowait?: number | null
}): CpuStackSegments | null {
  const user = clampPercent(input.user) ?? 0
  const system = clampPercent(input.system) ?? 0
  const iowait = clampPercent(input.iowait) ?? 0
  const usage = clampPercent(input.usage)
  const known =
    input.user != null ||
    input.system != null ||
    input.iowait != null ||
    input.usage != null
  if (!known) return null

  // Derived busy counts everything non-idle (iowait included); residual
  // active = nice/irq/softirq/steal.
  let other = 0
  if (usage != null) {
    other = Math.max(0, usage - user - system - iowait)
  }

  const sum = user + system + other + iowait
  if (sum > 100 && sum > 0) {
    const scale = 100 / sum
    return {
      user: user * scale,
      system: system * scale,
      other: other * scale,
      iowait: iowait * scale,
    }
  }
  return { user, system, other, iowait }
}

export function formatLoadPrimary(
  load1: number | null,
  load5: number | null,
  load15: number | null,
): string {
  if (load1 == null && load5 == null && load15 == null) return '—'
  return `${formatLoad(load1)}/${formatLoad(load5)}/${formatLoad(load15)}`
}

export function finiteMetric(value: number | null | undefined): number | null {
  return finiteOrNull(value)
}

/**
 * Used % from a capacity pair — `(total − free) / total`. The v2 metrics
 * contract stores raw byte counters only; every used-percentage the UI shows
 * comes through here.
 */
export function usedPercentFromBytes(
  totalBytes: number | null | undefined,
  freeBytes: number | null | undefined,
): number | null {
  const total = finiteOrNull(totalBytes)
  const free = finiteOrNull(freeBytes)
  if (total == null || free == null || total <= 0) return null
  return clampPercent(((total - free) / total) * 100)
}

/** Memory used % from `memoryTotalBytes` / `memoryAvailableBytes`. */
export function memoryUsedPercentFrom(
  totalBytes: number | null | undefined,
  availableBytes: number | null | undefined,
): number | null {
  return usedPercentFromBytes(totalBytes, availableBytes)
}

/** Swap used % from `swapTotalBytes` / `swapFreeBytes`. */
export function swapUsedPercentFrom(
  totalBytes: number | null | undefined,
  freeBytes: number | null | undefined,
): number | null {
  return usedPercentFromBytes(totalBytes, freeBytes)
}

export type UsageMetricInput = Readonly<{
  /** Stored idle % — busy is derived (`100 − idle`), never stored. */
  cpuIdlePercent?: number | null
  cpuUserPercent?: number | null
  cpuSystemPercent?: number | null
  cpuIowaitPercent?: number | null
  load1?: number | null
  load5?: number | null
  load15?: number | null
  /** Derived by the caller (e.g. {@link memoryUsedPercentFrom}). */
  memoryPercent?: number | null
  /** Derived by the caller (e.g. {@link swapUsedPercentFrom}). */
  swapPercent?: number | null
}>

/** True when any displayed usage metric has arrived (zero counts as a sample). */
export function hasUsageMetrics(input: UsageMetricInput): boolean {
  return [
    input.cpuIdlePercent,
    input.cpuUserPercent,
    input.cpuSystemPercent,
    input.cpuIowaitPercent,
    input.load1,
    input.load5,
    input.load15,
    input.memoryPercent,
    input.swapPercent,
  ].some((value) => finiteOrNull(value) != null)
}
