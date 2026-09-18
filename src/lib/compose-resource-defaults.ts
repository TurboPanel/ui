/**
 * The organization-wide default resource ceiling for compose services that
 * declare none (`organization.options.composeDefaultResourceLimits`), in the
 * shape the API stores — cores as Compose's `cpus`, memory as bytes — and the
 * shape the form shows: cores, and memory in MiB.
 *
 * The form talks in MiB because that is what people type for a container
 * (`512`, `2048`); the wire talks in bytes because that is what Compose's
 * `mem_limit` is. This module is the only place the two meet.
 */

export type ComposeDefaultResourceLimits = {
  /** Whole or fractional cores, as Compose's `cpus`. */
  cpus?: number
  /** Bytes, as Compose's `mem_limit`. */
  memoryBytes?: number
}

export const MIB = 1024 * 1024

export type ComposeResourceDefaultsDraft = {
  /** Cores, as typed. Empty means "no CPU ceiling". */
  cpus: string
  /** MiB, as typed. Empty means "no memory ceiling". */
  memoryMib: string
}

/** The stored limits, rendered for the two text fields. */
export function draftFromLimits(
  limits: ComposeDefaultResourceLimits | null,
): ComposeResourceDefaultsDraft {
  return {
    cpus: limits?.cpus === undefined ? '' : String(limits.cpus),
    memoryMib:
      limits?.memoryBytes === undefined
        ? ''
        : String(Math.round(limits.memoryBytes / MIB)),
  }
}

export type ParsedComposeResourceDefaults =
  | { ok: true; limits: ComposeDefaultResourceLimits | null }
  | { ok: false; error: string }

/**
 * Validate the two fields the way the API will (`cpus` finite and positive,
 * `memoryBytes` a positive integer, at least one of them present). Both empty
 * parses to `null`, which the API reads as "clear the default".
 */
export function parseComposeResourceDefaultsDraft(
  draft: ComposeResourceDefaultsDraft,
): ParsedComposeResourceDefaults {
  const cpusText = draft.cpus.trim()
  const memoryText = draft.memoryMib.trim()
  if (cpusText === '' && memoryText === '') return { ok: true, limits: null }

  const limits: ComposeDefaultResourceLimits = {}
  if (cpusText !== '') {
    const cpus = Number(cpusText)
    if (!Number.isFinite(cpus) || cpus <= 0) {
      return { ok: false, error: 'CPUs must be a positive number, such as 0.5 or 2.' }
    }
    limits.cpus = cpus
  }
  if (memoryText !== '') {
    const mib = Number(memoryText)
    if (!Number.isInteger(mib) || mib <= 0) {
      return {
        ok: false,
        error: 'Memory must be a whole number of MiB, such as 512 or 2048.',
      }
    }
    limits.memoryBytes = mib * MIB
  }
  return { ok: true, limits }
}

/** One line for the panel: what the ceiling currently is. */
export function describeComposeResourceDefaults(
  limits: ComposeDefaultResourceLimits | null,
): string {
  if (!limits) return 'No default ceiling — a service with no limits runs unbounded.'
  const parts: string[] = []
  if (limits.cpus !== undefined) parts.push(`${limits.cpus} CPU${limits.cpus === 1 ? '' : 's'}`)
  if (limits.memoryBytes !== undefined) {
    parts.push(`${Math.round(limits.memoryBytes / MIB)} MiB memory`)
  }
  return `Default ceiling: ${parts.join(' · ')}. Applied at deploy to services that declare no limits of their own.`
}
