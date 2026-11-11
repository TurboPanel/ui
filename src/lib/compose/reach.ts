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

export const REACH_ONE_ACCOUNT_NOTE =
  'A helper port opens to one Hosting Account, so once you choose one, only sites and apps of the same account can be added.'

const DIGITS = /^\d+$/

/** The container port as typed, or null when it is not a whole number from 1 to 65535. */
export function parseReachPort(text: string): number | null {
  const trimmed = text.trim()
  if (!DIGITS.test(trimmed)) return null
  const port = Number(trimmed)
  return port >= 1 && port <= 65535 ? port : null
}

/** A site or app a reach port may name, with the Hosting Account alias it runs as (null: not named). */
export type ReachCandidate = Readonly<{ name: string; account: string | null }>

/** The sites and apps of a document: services a reach port may name. */
export function reachCandidates(
  services: Readonly<Record<string, Readonly<{ kind?: string; account?: string }>>>
): ReachCandidate[] {
  return Object.entries(services)
    .filter(([, info]) => info.kind === 'site' || info.kind === 'node')
    .map(([name, info]) => ({ name, account: info.account ?? null }))
}

/**
 * A helper port opens to one Hosting Account, so once a name is chosen only
 * names under the same account can be added. A chosen name can always be cleared.
 */
export function reachSelectable(
  candidates: readonly ReachCandidate[],
  chosen: readonly string[],
  name: string
): boolean {
  if (chosen.length === 0 || chosen.includes(name)) return true
  const first = candidates.find((candidate) => candidate.name === chosen[0])
  const wanted = candidates.find((candidate) => candidate.name === name)
  // A chosen name that is no longer a site or app here has no account to compare.
  if (first === undefined || wanted === undefined) return true
  return first.account === wanted.account
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
