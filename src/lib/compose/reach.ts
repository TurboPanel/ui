/**
 * Checks and words for `x-turbopanel.reach`, a container's helper port.
 *
 * The control plane's compose lint is authoritative (`isValidReachValue` and
 * the single-account rule at deploy); this mirrors the shape rules so the
 * editor can say what is wrong before a save.
 */

import {
  isValidReachValue,
  MAX_REACH_FROM,
  type ComposeServiceReachExtension,
} from '@/lib/compose/service-kind'

export const REACH_SECTION_TITLE = 'Reachable from Sites'

export const REACH_HINT =
  'Opens one container port on this server to the sites and apps you choose. They must all run as one Hosting Account. They get TURBOPANEL_HELPER variables with the host and port on the next deploy.'

const DIGITS = /^\d+$/

/** The container port as typed, or null when it is not a whole number from 1 to 65535. */
export function parseReachPort(text: string): number | null {
  const trimmed = text.trim()
  if (!DIGITS.test(trimmed)) return null
  const port = Number(trimmed)
  return port >= 1 && port <= 65535 ? port : null
}

/** The sites and apps of a document: services a reach port may name. */
export function reachableServiceNames(
  kinds: Readonly<Record<string, string | undefined>>
): string[] {
  return Object.entries(kinds)
    .filter(([, kind]) => kind === 'site' || kind === 'node')
    .map(([name]) => name)
}

/** Add or remove a name, keeping the list's order and refusing more than the control plane allows. */
export function toggleReachName(from: readonly string[], name: string): string[] {
  if (from.includes(name)) return from.filter((entry) => entry !== name)
  return from.length >= MAX_REACH_FROM ? [...from] : [...from, name]
}

/**
 * What to write for the typed port and chosen names: `undefined` removes the
 * field (nothing typed, nothing chosen), a value when both are valid, and an
 * issue sentence when only one is.
 */
export function reachDecision(
  portText: string,
  from: readonly string[]
): { reach: ComposeServiceReachExtension | undefined; issue: string | null } {
  if (portText.trim() === '' && from.length === 0) return { reach: undefined, issue: null }
  const port = parseReachPort(portText)
  if (port === null) return { reach: undefined, issue: 'Enter a port from 1 to 65535.' }
  if (from.length === 0) {
    return { reach: undefined, issue: 'Choose at least one site or app.' }
  }
  const reach = { port, from: [...from] }
  return isValidReachValue(reach)
    ? { reach, issue: null }
    : { reach: undefined, issue: 'Use each site or app once, by its service name.' }
}
