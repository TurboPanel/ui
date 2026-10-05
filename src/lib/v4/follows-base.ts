/**
 * "Follows the Base" or "Stands alone", derived from what is saved.
 *
 * There is no stored switch (owner decision): an environment stands alone
 * when its own saved compose file replaces the Base's whole `services` block
 * with `services: !override ...`. That is exactly what the New environment
 * "Empty, stands alone" choice and the Environment settings switch write, so
 * the answer can never disagree with how a deploy actually merges.
 *
 * Every other saved shape follows the Base:
 * - no compose, or a blank one (a new environment "from the Base")
 * - a plain `services` map (the environment adds or changes services)
 * - a tag on one service only (`services.web: !override`) replaces that one
 *   service, the rest still comes from the Base
 * - `services: !reset` removes every Base service but is not a stand-alone
 *   setup: the environment still merges over the Base, so it follows the Base
 *   (and shows every service as removed in its changes)
 */

import { composeTagOf } from '@/lib/compose/tags'
import { normalizeCompose } from '@/lib/compose/types'

/** True when the environment's saved compose replaces the Base's services. */
export function environmentStandsAlone(environmentCompose: unknown): boolean {
  const { data } = normalizeCompose(environmentCompose)
  return composeTagOf(data.services) === 'override'
}

/** The inverse, for call sites that read better as "follows". */
export function environmentFollowsBase(environmentCompose: unknown): boolean {
  return !environmentStandsAlone(environmentCompose)
}
