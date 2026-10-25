/**
 * The primary environment and the pinned ones: which environment a project
 * opens on, the order environments are listed in, and the plain words for the
 * controls around them.
 *
 * A project has one primary environment (the landing, the status, the source a
 * new environment copies) and any number of pinned ones (listed right after
 * it). The control plane already returns them in that order; the helpers here
 * keep the order if a list arrives otherwise. Pure: no React, no network.
 */

import type { EnvironmentRecord } from '@/lib/instance-api'

type Flagged = Pick<EnvironmentRecord, 'isPrimary' | 'pinned'>

/** The environment a project opens on: the marked one, else the first listed. */
export function primaryEnvironmentOf<T extends Flagged>(environments: readonly T[]): T | null {
  return environments.find((env) => env.isPrimary === true) ?? environments[0] ?? null
}

function rank(env: Flagged): number {
  if (env.isPrimary === true) return 0
  return env.pinned === true ? 1 : 2
}

/** Primary first, pinned next, then the rest in the order they came. */
export function orderEnvironments<T extends Flagged>(environments: readonly T[]): T[] {
  return environments
    .map((env, index) => ({ env, index }))
    .sort((a, b) => rank(a.env) - rank(b.env) || a.index - b.index)
    .map((item) => item.env)
}

export type EnvironmentBadge = 'Primary' | 'Pinned'

export function environmentBadge(env: Flagged): EnvironmentBadge | null {
  if (env.isPrimary === true) return 'Primary'
  return env.pinned === true ? 'Pinned' : null
}

/** The Base needs a clear button once there is more than one environment to share it. */
export function baseIsProminent(environmentCount: number): boolean {
  return environmentCount > 1
}

export const BASE_WHEN_TO_USE =
  'Use the Base for settings every environment shares, such as a common service, Hosting Account or variable. A change there reaches all environments on their next deploy. To change one environment only, open it instead.'

export const BASE_EDIT_WARNING =
  "A change here reaches every environment that doesn't set its own value, on its next deploy."

export const PRIMARY_DELETE_EXPLANATION =
  'This is the primary environment, so it cannot be deleted. Make another environment primary first.'

export const MAKE_PRIMARY_EXPLANATION =
  'The primary environment is where this project opens, what its status shows, and what a new environment copies.'

export const PIN_EXPLANATION = 'Pinned environments are listed right after the primary one.'

/** Short words for the pin control. */
/** Said on the New environment sheet before a copy is made. */
export const NOT_COPIED_NOTE =
  'A copy does not include hostnames, published host ports, container names, the git branch (so nothing deploys on push until you choose one), variables and secrets, or the server choice.'

export function pinActionLabel(pinned: boolean): string {
  return pinned ? 'Unpin' : 'Pin'
}
