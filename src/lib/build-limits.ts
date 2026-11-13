/**
 * Build core and memory limits: the drafts the settings screens edit and what
 * the control plane stores (`organization.options.buildLimits`,
 * `server.options.buildLimits`, `service.options.build`). The smallest limit
 * set among the three applies to a build; empty uses half the server's cores
 * and its RAM less 1 GiB.
 */

export const BUILD_CORES_LABEL = 'Build Cores'
export const BUILD_MEMORY_LABEL = 'Build Memory'

export const BUILD_CORES_HINT =
  "Most CPU cores one build may use. The smallest of the organization, server and service limits applies. Empty uses half the server's cores."
export const BUILD_MEMORY_HINT =
  "Most memory one build may use, in GB. The smallest of the organization, server and service limits applies. Empty uses the server's memory minus 1 GB."

export const BUILD_SWAP_LABEL = 'Build Swap'
export const BUILD_SWAP_HINT =
  'Lets a build use swap space. Off unless a level allows it; the service setting wins, then the server, then the organization.'

export type BuildSwapChoice = 'inherit' | 'allowed' | 'off'

export const BUILD_SWAP_OPTIONS: readonly { value: BuildSwapChoice; label: string }[] = [
  { value: 'inherit', label: 'Not Set' },
  { value: 'allowed', label: 'Allowed' },
  { value: 'off', label: 'Off' },
]

export function buildSwapChoice(swap: boolean | null | undefined): BuildSwapChoice {
  if (swap === true) return 'allowed'
  if (swap === false) return 'off'
  return 'inherit'
}

export function buildSwapValue(choice: BuildSwapChoice): boolean | null {
  if (choice === 'allowed') return true
  if (choice === 'off') return false
  return null
}

export const BUILD_CORES_MIN = 1
export const BUILD_CORES_MAX = 999
export const BUILD_MEMORY_MIN_GB = 1
/** 1 TiB, the same ceiling the control plane enforces. */
export const BUILD_MEMORY_MAX_GB = 1024

const GIB = 1024 ** 3

/** One level's limits; `null` means not set. */
export type BuildLimitValues = {
  cores: number | null
  memoryBytes: number | null
  /** `null` is not set at this level. */
  swap: boolean | null
}

export const NO_BUILD_LIMITS: BuildLimitValues = { cores: null, memoryBytes: null, swap: null }

const DECIMAL_RE = /^\d{1,4}(\.\d{1,2})?$/

/** Empty is `null` (not set), a valid number is itself, anything else is `undefined`. */
export function parseBuildCoresDraft(raw: string): number | null | undefined {
  const text = raw.trim()
  if (text.length === 0) return null
  if (!DECIMAL_RE.test(text)) return undefined
  const cores = Number(text)
  return cores >= BUILD_CORES_MIN && cores <= BUILD_CORES_MAX ? cores : undefined
}

/** Empty is `null`, a number of GB (fractions allowed) from 1 to 1024 is bytes, anything else `undefined`. */
export function parseBuildMemoryDraft(raw: string): number | null | undefined {
  const text = raw.trim()
  if (text.length === 0) return null
  if (!DECIMAL_RE.test(text)) return undefined
  const gb = Number(text)
  if (gb < BUILD_MEMORY_MIN_GB || gb > BUILD_MEMORY_MAX_GB) return undefined
  return Math.round(gb * GIB)
}

export function formatBuildCores(cores: number | null | undefined): string {
  return cores == null ? '' : String(cores)
}

/** GB with up to two decimals, no trailing zeros. */
export function formatBuildMemory(bytes: number | null | undefined): string {
  if (bytes == null) return ''
  return String(Math.round((bytes / GIB) * 100) / 100)
}

export const BUILD_CORES_ERROR = `${BUILD_CORES_LABEL} must be a number from ${BUILD_CORES_MIN} to ${BUILD_CORES_MAX} (fractions such as 1.5 are fine), or empty.`
export const BUILD_MEMORY_ERROR = `${BUILD_MEMORY_LABEL} must be a number of GB from ${BUILD_MEMORY_MIN_GB} to ${BUILD_MEMORY_MAX_GB}, or empty.`

/** Both drafts parsed, or the message to show. */
export function parseBuildLimitDrafts(
  coresDraft: string,
  memoryDraft: string
): { ok: true; values: BuildLimitValues } | { ok: false; error: string } {
  const cores = parseBuildCoresDraft(coresDraft)
  if (cores === undefined) return { ok: false, error: BUILD_CORES_ERROR }
  const memoryBytes = parseBuildMemoryDraft(memoryDraft)
  if (memoryBytes === undefined) return { ok: false, error: BUILD_MEMORY_ERROR }
  return { ok: true, values: { cores, memoryBytes, swap: null } }
}
