export type UpgradeBatchMode = 'percent' | 'count'

export type UpgradeBatchInput = {
  mode: UpgradeBatchMode
  value: string
}

export type UpgradeBatchValidation =
  { ok: true; mode: UpgradeBatchMode; value: number } | { ok: false; message: string }

const PERCENT_MIN = 1
const PERCENT_MAX = 100
const COUNT_MIN = 1
const COUNT_MAX = 10_000

export function validateUpgradeBatchInput(input: UpgradeBatchInput): UpgradeBatchValidation {
  const trimmed = input.value.trim()
  if (trimmed === '') {
    return { ok: false, message: 'Enter how many servers update at once.' }
  }
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed)) {
    return { ok: false, message: 'Use a whole number.' }
  }
  if (input.mode === 'percent') {
    if (parsed < PERCENT_MIN || parsed > PERCENT_MAX) {
      return {
        ok: false,
        message: `Use ${PERCENT_MIN}–${PERCENT_MAX} percent.`,
      }
    }
    return { ok: true, mode: 'percent', value: parsed }
  }
  if (parsed < COUNT_MIN || parsed > COUNT_MAX) {
    return {
      ok: false,
      message: `Use ${COUNT_MIN}–${COUNT_MAX} servers.`,
    }
  }
  return { ok: true, mode: 'count', value: parsed }
}

export const UPGRADE_FLEET_PAGE_SIZE = 50

/** Server page for the fleet table. Offset resets when the filter changes. */
export function fleetServersQuery(
  offset: number,
  status: string,
  pageSize = UPGRADE_FLEET_PAGE_SIZE
): { offset: number; limit: number; status: string } {
  const safeOffset = Math.max(offset, 0)
  return { offset: safeOffset, limit: pageSize, status }
}

/** "Servers updated at once: all" (100%), "…: 25%", or "…: 4": one plain term for the group size. */
export function formatUpgradeBatchLabel(mode: UpgradeBatchMode, value: number): string {
  if (mode === 'percent') {
    return `Servers updated at once: ${value >= PERCENT_MAX ? 'all' : `${value}%`}`
  }
  return `Servers updated at once: ${value}`
}
