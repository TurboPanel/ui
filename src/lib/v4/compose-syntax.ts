/**
 * Compose key names the Configuration writers need. They are file syntax, not
 * words shown to a person ("principal" is the compose key of a Linux user), so
 * they live here, apart from the modules that produce copy, and the banned-word
 * scan in `vocabulary.test.ts` skips this file.
 */

import { composeTagOf } from '@/lib/compose/tags'

export const EXTENSION_KEY = 'x-turbopanel'

/** `x-turbopanel.principal`: the Linux user an app runs as. */
export const LINUX_USER_PATH: readonly string[] = [EXTENSION_KEY, 'principal']

/** `x-turbopanel.principals.{name}.access`: sign-in access of a Linux user. */
export function linuxUserAccessPath(name: string): readonly string[] {
  return [EXTENSION_KEY, 'principals', name, 'access']
}

/** A `services` block replaced (`!override`) or emptied (`!reset`) cuts the environment off from the Base. */
export function servicesAreDetached(services: unknown): boolean {
  const tag = composeTagOf(services)
  return tag === 'override' || tag === 'reset'
}
