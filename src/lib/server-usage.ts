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

  // usage excludes iowait; residual active = irq/softirq/steal/etc.
  let other = 0
  if (usage != null) {
    other = Math.max(0, usage - user - system)
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
